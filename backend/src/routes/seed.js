import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import ProductionDaily from "../models/ProductionDaily.js";

await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/jetty"
);
console.log("MongoDB connecté à:", mongoose.connection.db.databaseName);

const WORK_UNITS = ["WU-A1", "WU-B1", "WU-C1"];

const EMPLOYEES = [
  { id: "EMP001", name: "Ali Ben Salah" },
  { id: "EMP002", name: "Mohamed Trabelsi" },
  { id: "EMP003", name: "Sami Gharbi" },
  { id: "EMP004", name: "Youssef Ben Amor" },
  { id: "EMP005", name: "Walid Jaziri" },
  { id: "EMP006", name: "Karim Mansouri" },
  { id: "EMP007", name: "Nabil Ferchichi" },
  { id: "EMP008", name: "Hassen Boughanem" },
];

const DEPARTMENTS = [
  "Assemblage câblage",
  "Sertissage",
  "Insertion connecteurs",
  "Contrôle qualité",
  "Emballage",
];

const WU_CONFIG = {
  "WU-A1": { base: 620, trend: 0.08, noiseRatio: 0.04, breakdownProb: 0.025, label: "Ligne Tableau de Bord" },
  "WU-B1": { base: 480, trend: 0.06, noiseRatio: 0.05, breakdownProb: 0.035, label: "Ligne Faisceau Moteur" },
  "WU-C1": { base: 550, trend: 0.10, noiseRatio: 0.045, breakdownProb: 0.020, label: "Ligne Portes / Toiture" },
};

function isTunisianHoliday(dateStr) {
  const FIXED_HOLIDAYS = new Set([
    "01-01","03-20","04-09","05-01","07-25","08-13","10-15","12-17",
  ]);
  const EID_FITR = new Set([
    "2023-04-21","2023-04-22","2023-04-23",
    "2024-04-10","2024-04-11","2024-04-12",
    "2025-03-30","2025-03-31","2026-03-20",
  ]);
  const EID_ADHA = new Set([
    "2023-06-28","2023-06-29","2023-06-30",
    "2024-06-16","2024-06-17","2024-06-18",
    "2025-06-06","2025-06-07","2025-06-08",
    "2026-05-27","2026-05-28",
  ]);
  const MUHARRAM = new Set(["2023-07-19","2024-07-07","2025-06-26"]);
  const MAWLID   = new Set(["2023-09-27","2024-09-15","2025-09-04"]);
  const mmdd = dateStr.slice(5);
  return FIXED_HOLIDAYS.has(mmdd) || EID_FITR.has(dateStr) || EID_ADHA.has(dateStr)
      || MUHARRAM.has(dateStr) || MAWLID.has(dateStr);
}

function isRamadan(dateStr) {
  const d = new Date(dateStr);
  const periods = [
    { start: new Date("2023-03-23"), end: new Date("2023-04-20") },
    { start: new Date("2024-03-11"), end: new Date("2024-04-09") },
    { start: new Date("2025-03-01"), end: new Date("2025-03-29") },
    { start: new Date("2026-02-18"), end: new Date("2026-03-19") },
  ];
  return periods.some((r) => d >= r.start && d <= r.end);
}

const STRIKE_DAYS = new Set([
  "2023-10-03","2023-10-04","2024-02-20",
  "2024-11-12","2024-11-13","2025-04-15",
  "2025-10-07","2025-10-08",
]);

const MAINTENANCE_DAY_OF_MONTH = { "WU-A1": 5, "WU-B1": 12, "WU-C1": 19 };

function buildMaintenanceDates(startDate, endDate) {
  const result = new Set();
  for (const wu of WORK_UNITS) {
    const targetDay = MAINTENANCE_DAY_OF_MONTH[wu];
    let d = new Date(startDate);
    while (d <= endDate) {
      let candidate = new Date(d.getFullYear(), d.getMonth(), targetDay);
      while (
        [0, 6].includes(candidate.getDay()) ||
        isTunisianHoliday(formatDate(candidate))
      ) {
        candidate.setDate(candidate.getDate() + 1);
      }
      result.add(`${wu}::${formatDate(candidate)}`);
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
    }
  }
  return result;
}

const WEEKLY_PATTERN = { 0: null, 1: 1.06, 2: 1.08, 3: 1.04, 4: 1.00, 5: 0.88, 6: null };

const MONTHLY_FACTORS = {
  0:0.90,1:0.93,2:0.98,3:1.00,4:1.05,5:1.03,
  6:0.85,7:0.82,8:1.02,9:1.06,10:1.07,11:0.88,
};

function random(min, max)      { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFloat(min, max) { return min + Math.random() * (max - min); }
function randomChoice(arr)     { return arr[Math.floor(Math.random() * arr.length)]; }
function formatDate(date)      { return date.toISOString().split("T")[0]; }

function gaussianNoise() {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const raw = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-2, Math.min(2, raw));
}

function getWeekNumber(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
}

function generateRecord(workUnit, dateStr, dayIndex, dayOfWeek, monthIndex, breakdownState, maintenanceDates) {
  if (WEEKLY_PATTERN[dayOfWeek] === null) return null;
  if (isTunisianHoliday(dateStr))        return null;
  if (STRIKE_DAYS.has(dateStr))          return null;

  const cfg           = WU_CONFIG[workUnit];
  const ramadan       = isRamadan(dateStr);
  const isMaintenance = maintenanceDates.has(`${workUnit}::${dateStr}`);

  if (breakdownState[workUnit] > 0) {
    breakdownState[workUnit]--;
    if (Math.random() < 0.7) return null;
    const degradedQty = Math.max(20, Math.round(cfg.base * randomFloat(0.15, 0.30)));
    return {
      goodQty:            degradedQty,
      defectsQty:         Math.max(2, Math.round(degradedQty * randomFloat(0.06, 0.12))),
      scrapQty:           Math.max(1, Math.round(degradedQty * randomFloat(0.03, 0.07))),
      upSeconds:          random(10800, 18000),
      workSeconds:        random(10800, 18000),
      theoreticalSeconds: 28800,
      eventType:          "PANNE_PARTIELLE",
    };
  }

  if (Math.random() < cfg.breakdownProb) {
    breakdownState[workUnit] = random(1, 3);
    const downtime   = random(14400, 25200);
    const upSec      = 28800 - downtime;
    const reducedQty = Math.max(20, Math.round(cfg.base * 0.25 * (upSec / 28800)));
    return {
      goodQty:            reducedQty,
      defectsQty:         Math.max(2, Math.round(reducedQty * randomFloat(0.04, 0.10))),
      scrapQty:           Math.max(1, Math.round(reducedQty * randomFloat(0.02, 0.06))),
      upSeconds:          upSec,
      workSeconds:        upSec,
      theoreticalSeconds: 28800,
      eventType:          "PANNE",
    };
  }

  if (isMaintenance) {
    const upSec = random(14400, 18000);
    const qty   = Math.max(30, Math.round(cfg.base * 0.35 * (upSec / 28800)));
    return {
      goodQty:            qty,
      defectsQty:         Math.max(1, Math.round(qty * randomFloat(0.005, 0.015))),
      scrapQty:           Math.max(0, Math.round(qty * randomFloat(0.001, 0.005))),
      upSeconds:          upSec,
      workSeconds:        upSec,
      theoreticalSeconds: 28800,
      eventType:          "MAINTENANCE",
    };
  }

  const weeklyFactor  = WEEKLY_PATTERN[dayOfWeek];
  const monthlyFactor = MONTHLY_FACTORS[monthIndex] ?? 1.0;
  const trendFactor   = 1 + (dayIndex * cfg.trend) / 10000;
  const ramadanFactor = ramadan ? randomFloat(0.68, 0.78) : 1.0;
  const dailyFactor   = randomFloat(0.90, 1.10);
  const noise         = gaussianNoise();

  const theoreticalQty = cfg.base * trendFactor * weeklyFactor * monthlyFactor * ramadanFactor * dailyFactor;
  const goodQty        = Math.max(40, Math.round(theoreticalQty + noise * cfg.noiseRatio * cfg.base));

  const baseDefectRate = ramadan ? randomFloat(0.025, 0.055) : randomFloat(0.008, 0.032);
  const defectsQty     = Math.max(1, Math.round(goodQty * baseDefectRate));
  const scrapQty       = Math.max(0, Math.round(goodQty * randomFloat(0.002, 0.010)));
  const microStops     = random(5, 35) * 60;
  const upSec          = Math.max(24000, 28800 - microStops);

  return {
    goodQty,
    defectsQty,
    scrapQty,
    upSeconds:          upSec,
    workSeconds:        upSec,
    theoreticalSeconds: 28800,
    eventType:          ramadan ? "RAMADAN" : "NORMAL",
  };
}

const startDate = new Date("2023-06-05");
const endDate   = new Date("2026-06-04");
const maintenanceDates = buildMaintenanceDates(startDate, endDate);
const breakdownState = { "WU-A1": 0, "WU-B1": 0, "WU-C1": 0 };

const records = [];
let dayIndex  = 0;

for (
  let d = new Date(startDate);
  d <= endDate;
  d.setDate(d.getDate() + 1), dayIndex++
) {
  const dateStr    = formatDate(d);
  const dayOfWeek  = d.getDay();
  const monthIndex = d.getMonth();

  for (const workUnit of WORK_UNITS) {
    const production = generateRecord(
      workUnit, dateStr, dayIndex, dayOfWeek, monthIndex,
      breakdownState, maintenanceDates
    );
    if (!production) continue;

    const employee = randomChoice(EMPLOYEES);
    records.push({
      date:               dateStr,
      workUnit,
      employeeId:         employee.id,
      employeeName:       employee.name,
      department:         randomChoice(DEPARTMENTS),
      goodQty:            production.goodQty,
      defectsQty:         production.defectsQty,
      scrapQty:           production.scrapQty,
      theoreticalSeconds: production.theoreticalSeconds,
      upSeconds:          production.upSeconds,
      workSeconds:        production.workSeconds,
      eventType:          production.eventType,
      dayOfWeek,
      weekNumber:         getWeekNumber(d),
      monthIndex,
      isRamadan:          isRamadan(dateStr),
      _isDemo:            true,
    });
  }
}

console.log(`\n📊 Résumé par Work Unit :`);
for (const wu of WORK_UNITS) {
  const r      = records.filter((x) => x.workUnit === wu);
  const normal = r.filter((x) => x.eventType === "NORMAL");
  const avg    = Math.round(normal.reduce((s, x) => s + x.goodQty, 0) / (normal.length || 1));
  const std    = Math.round(Math.sqrt(normal.reduce((s, x) => s + Math.pow(x.goodQty - avg, 2), 0) / (normal.length || 1)));
  console.log(`  ${WU_CONFIG[wu].label} (${wu})`);
  console.log(`    ${r.length} jours | avg=${avg} | std=±${std}`);
  console.log(`    Pannes: ${r.filter(x=>x.eventType==="PANNE").length}j | Pannes partielles: ${r.filter(x=>x.eventType==="PANNE_PARTIELLE").length}j | Ramadan: ${r.filter(x=>x.eventType==="RAMADAN").length}j | Maintenance: ${r.filter(x=>x.eventType==="MAINTENANCE").length}j`);
}

await ProductionDaily.deleteMany({ _isDemo: true });
const BATCH_SIZE = 500;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  await ProductionDaily.insertMany(records.slice(i, i + BATCH_SIZE));
  process.stdout.write(`\r  ✅ Inséré ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
}

console.log("\n\n✅ Seed corrigé terminé !");
console.log(`   → ${records.length} records | du ${formatDate(startDate)} au ${formatDate(endDate)}`);

await mongoose.disconnect();
process.exit(0);