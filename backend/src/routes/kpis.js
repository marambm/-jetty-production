import { Router } from "express";
import ProductionDaily from "../models/ProductionDaily.js";
import Alert from "../models/Alert.js";
import Settings from "../models/Settings.js";
import { requireAuth } from "../middlewares/auth.js";
import { isDbConnected } from "../config/db.js";

const router = Router();

// ── Seuils par défaut (utilisés si MongoDB inaccessible) ──────────────────────
const DEFAULT_THRESHOLDS = {
  rendementWarning:  85,
  rendementCritical: 70,
  pertesWarning:     10,
  pertesCritical:    20,
};

// ── Lecture des seuils depuis MongoDB ────────────────────────────────────────
async function getThresholds() {
  try {
    const doc = await Settings.findOne().lean();
    if (doc?.thresholds) return { ...DEFAULT_THRESHOLDS, ...doc.thresholds };
  } catch (err) {
    console.warn("[Alerts] Impossible de lire les seuils depuis MongoDB, utilisation des défauts:", err.message);
  }
  return { ...DEFAULT_THRESHOLDS };
}

function computeAvailability(upSeconds, theoreticalSeconds) {
  if (theoreticalSeconds > 0 && upSeconds > 0) {
    return parseFloat(Math.min((upSeconds / theoreticalSeconds) * 100, 100).toFixed(2));
  }
  return null;
}

function computePerformance(productionTotal, upSeconds, idealThroughput) {
  if (upSeconds > 0 && idealThroughput > 0) {
    return parseFloat(Math.min((productionTotal / (upSeconds * idealThroughput)) * 100, 100).toFixed(2));
  }
  return null;
}

function computeQuality(goodQty, productionTotal) {
  if (productionTotal > 0) {
    return parseFloat(((goodQty / productionTotal) * 100).toFixed(2));
  }
  return null;
}

function computeOee(availability, performance, quality) {
  if (availability !== null && performance !== null && quality !== null) {
    return parseFloat(((availability / 100) * (performance / 100) * (quality / 100) * 100).toFixed(2));
  }
  return null;
}

function computeIdealThroughput(dailyData) {
  const rates = dailyData
    .filter((d) => d.upSeconds > 0)
    .map((d) => {
      const productionTotal = (d.goodQty || 0) + (d.defectsQty || 0) + (d.scrapQty || 0);
      return productionTotal / d.upSeconds;
    })
    .sort((a, b) => a - b);

  if (rates.length === 0) return null;
  if (rates.length === 1) return rates[0];
  const index = Math.min(Math.floor(rates.length * 0.95), rates.length - 1);
  return rates[index];
}

// ── Seuils OEE/disponibilité/performance/qualité dérivés des seuils rendement ─
// Les seuils MongoDB couvrent rendement et pertes.
// Pour availability/performance/quality/oee on garde des seuils fixes OEE-standard
// mais on utilise rendementWarning/rendementCritical pour la qualité.
function determineStatusColor(availability, performance, quality, oee, thresholds) {
  const qWarn = thresholds.rendementWarning  ?? 85;
  const qCrit = thresholds.rendementCritical ?? 70;

  if (oee !== null && oee < 55)                   return "red";
  if (availability !== null && availability < 70)  return "red";
  if (quality !== null && quality < qCrit)         return "red";
  if (oee !== null && oee < 67)                    return "orange";
  if (availability !== null && availability < 82)  return "orange";
  if (performance !== null && performance < 80)    return "orange";
  if (quality !== null && quality < qWarn)         return "orange";
  return "green";
}

// ── Génère les alertes en utilisant les seuils MongoDB ───────────────────────
function generateAlerts(date, workUnit, availability, performance, quality, oee, thresholds) {
  const alerts = [];

  const qWarn = thresholds.rendementWarning  ?? 85;
  const qCrit = thresholds.rendementCritical ?? 70;

  // Disponibilité — seuils OEE standard (non configurables pour l'instant)
  if (availability !== null) {
    if (availability < 70) {
      alerts.push({
        date, workUnit,
        type: "availability_critical",
        level: "red",
        metric: "availability",
        value: availability,
        message: `${workUnit} : Disponibilité critique (${availability}%).`,
      });
    } else if (availability < 82) {
      alerts.push({
        date, workUnit,
        type: "availability_low",
        level: "orange",
        metric: "availability",
        value: availability,
        message: `${workUnit} : Disponibilité basse (${availability}%).`,
      });
    }
  }

  // Performance — seuils OEE standard
  if (performance !== null) {
    if (performance < 75) {
      alerts.push({
        date, workUnit,
        type: "performance_critical",
        level: "red",
        metric: "performance",
        value: performance,
        message: `${workUnit} : Performance critique (${performance}%).`,
      });
    } else if (performance < 84) {
      alerts.push({
        date, workUnit,
        type: "performance_low",
        level: "orange",
        metric: "performance",
        value: performance,
        message: `${workUnit} : Performance basse (${performance}%).`,
      });
    }
  }

  // Qualité — utilise rendementWarning / rendementCritical depuis MongoDB
  if (quality !== null) {
    if (quality < qCrit) {
      alerts.push({
        date, workUnit,
        type: "quality_critical",
        level: "red",
        metric: "quality",
        value: quality,
        message: `${workUnit} : Qualité critique (${quality}% < seuil ${qCrit}%).`,
      });
    } else if (quality < qWarn) {
      alerts.push({
        date, workUnit,
        type: "quality_low",
        level: "orange",
        metric: "quality",
        value: quality,
        message: `${workUnit} : Qualité insuffisante (${quality}% < seuil ${qWarn}%).`,
      });
    }
  }

  // OEE — seuils OEE standard
  if (oee !== null) {
    if (oee < 55) {
      alerts.push({
        date, workUnit,
        type: "oee_critical",
        level: "red",
        metric: "oee",
        value: oee,
        message: `${workUnit} : OEE critique (${oee}%).`,
      });
    } else if (oee < 67) {
      alerts.push({
        date, workUnit,
        type: "oee_low",
        level: "orange",
        metric: "oee",
        value: oee,
        message: `${workUnit} : OEE bas (${oee}%).`,
      });
    }
  }

  return alerts;
}

function dateDaysAgo(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

// ── Fonction réutilisable : calcule et sauvegarde les alertes d'une date ─────
export async function computeAndSaveAlerts(date) {
  // Lit les seuils DEPUIS MongoDB à chaque appel
  const thresholds = await getThresholds();

  const records = await ProductionDaily.aggregate([
    { $match: { date } },
    {
      $group: {
        _id:                "$workUnit",
        goodQty:            { $sum: "$goodQty" },
        defectsQty:         { $sum: "$defectsQty" },
        scrapQty:           { $sum: "$scrapQty" },
        upSeconds:          { $sum: "$upSeconds" },
        workSeconds:        { $sum: "$workSeconds" },
        theoreticalSeconds: { $sum: "$theoreticalSeconds" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  if (records.length === 0) return 0;

  const refFrom       = dateDaysAgo(date, 60);
  const historicalRaw = await ProductionDaily.aggregate([
    { $match: { date: { $gte: refFrom, $lte: date }, upSeconds: { $gt: 0 } } },
    {
      $group: {
        _id:       "$date",
        goodQty:   { $sum: "$goodQty" },
        defectsQty:{ $sum: "$defectsQty" },
        scrapQty:  { $sum: "$scrapQty" },
        upSeconds: { $sum: "$upSeconds" },
      },
    },
  ]);

  const idealThroughput = computeIdealThroughput(historicalRaw);
  const allAlerts       = [];

  for (const rec of records) {
    const productionTotal = rec.goodQty + rec.defectsQty + rec.scrapQty;
    const availability    = computeAvailability(rec.upSeconds, rec.theoreticalSeconds);
    const performance     = computePerformance(productionTotal, rec.upSeconds, idealThroughput);
    const quality         = computeQuality(rec.goodQty, productionTotal);
    const oee             = computeOee(availability, performance, quality);
    allAlerts.push(...generateAlerts(date, rec._id, availability, performance, quality, oee, thresholds));
  }

  await Alert.deleteMany({ date });
  if (allAlerts.length > 0) {
    await Alert.insertMany(allAlerts, { ordered: false }).catch(() => {});
  }

  console.log(`[Alerts] ✅ ${allAlerts.length} alertes générées pour ${date} (seuils: rendementWarning=${thresholds.rendementWarning}, rendementCritical=${thresholds.rendementCritical})`);
  return allAlerts.length;
}

// ─── POST /api/kpis/compute ───────────────────────────────────────────────────
router.post("/kpis/compute", requireAuth, async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "Fournir une date valide : ?date=YYYY-MM-DD" });
    }

    // Lit les seuils depuis MongoDB
    const thresholds = await getThresholds();

    const records = await ProductionDaily.aggregate([
      { $match: { date } },
      {
        $group: {
          _id:                "$workUnit",
          goodQty:            { $sum: "$goodQty" },
          defectsQty:         { $sum: "$defectsQty" },
          scrapQty:           { $sum: "$scrapQty" },
          upSeconds:          { $sum: "$upSeconds" },
          workSeconds:        { $sum: "$workSeconds" },
          theoreticalSeconds: { $sum: "$theoreticalSeconds" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    if (records.length === 0) {
      return res.status(404).json({ ok: false, error: `Aucune donnée pour ${date}.` });
    }

    const refFrom       = dateDaysAgo(date, 60);
    const historicalRaw = await ProductionDaily.aggregate([
      { $match: { date: { $gte: refFrom, $lte: date }, upSeconds: { $gt: 0 } } },
      {
        $group: {
          _id:       "$date",
          goodQty:   { $sum: "$goodQty" },
          defectsQty:{ $sum: "$defectsQty" },
          scrapQty:  { $sum: "$scrapQty" },
          upSeconds: { $sum: "$upSeconds" },
        },
      },
    ]);

    const idealThroughput = computeIdealThroughput(historicalRaw);
    const kpis      = [];
    const allAlerts = [];

    for (const rec of records) {
      const workUnit        = rec._id;
      const productionTotal = rec.goodQty + rec.defectsQty + rec.scrapQty;
      const availability    = computeAvailability(rec.upSeconds, rec.theoreticalSeconds);
      const performance     = computePerformance(productionTotal, rec.upSeconds, idealThroughput);
      const quality         = computeQuality(rec.goodQty, productionTotal);
      const oee             = computeOee(availability, performance, quality);
      const statusColor     = determineStatusColor(availability, performance, quality, oee, thresholds);

      kpis.push({
        date, workUnit,
        goodQty: rec.goodQty, defectsQty: rec.defectsQty, scrapQty: rec.scrapQty,
        productionTotal, losses: rec.defectsQty + rec.scrapQty,
        upSeconds: rec.upSeconds, workSeconds: rec.workSeconds,
        theoreticalSeconds: rec.theoreticalSeconds,
        availability, performance, quality, oee, statusColor,
      });

      allAlerts.push(...generateAlerts(date, workUnit, availability, performance, quality, oee, thresholds));
    }

    await Alert.deleteMany({ date });
    if (allAlerts.length > 0) {
      await Alert.insertMany(allAlerts, { ordered: false }).catch(() => {});
    }

    return res.json({
      ok: true, date,
      workUnitsProcessed: records.length,
      idealThroughput, kpis,
      alertsGenerated: allAlerts.length,
      alerts: allAlerts,
      thresholdsUsed: thresholds,
    });
  } catch (err) {
    console.error("KPI compute error:", err);
    return res.status(500).json({ ok: false, error: "Échec du calcul KPI : " + err.message });
  }
});

// ─── GET /api/kpis ────────────────────────────────────────────────────────────
router.get("/kpis", async (req, res) => {
  if (!isDbConnected()) {
    return res.json({ ok: true, summary: {}, daily: [], workUnits: [], _noDb: true });
  }

  try {
    const today          = new Date().toISOString().split("T")[0];
    const to             = req.query.to   || today;
    const from           = req.query.from || dateDaysAgo(to, 29);
    const workUnitFilter = req.query.workUnit || null;

    const match = { date: { $gte: from, $lte: to } };
    if (workUnitFilter) match.workUnit = workUnitFilter;

    const dailyRaw = await ProductionDaily.aggregate([
      { $match: match },
      {
        $group: {
          _id:                "$date",
          goodQty:            { $sum: "$goodQty" },
          defectsQty:         { $sum: "$defectsQty" },
          scrapQty:           { $sum: "$scrapQty" },
          upSeconds:          { $sum: "$upSeconds" },
          workSeconds:        { $sum: "$workSeconds" },
          theoreticalSeconds: { $sum: "$theoreticalSeconds" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const idealThroughput = computeIdealThroughput(dailyRaw);

    const daily = dailyRaw.map((d) => {
      const productionTotal = d.goodQty + d.defectsQty + d.scrapQty;
      const availability    = computeAvailability(d.upSeconds, d.theoreticalSeconds);
      const performance     = computePerformance(productionTotal, d.upSeconds, idealThroughput);
      const quality         = computeQuality(d.goodQty, productionTotal);
      const oee             = computeOee(availability, performance, quality);
      return {
        date: d._id, goodQty: d.goodQty, defectsQty: d.defectsQty, scrapQty: d.scrapQty,
        productionTotal, losses: d.defectsQty + d.scrapQty,
        upSeconds: d.upSeconds, workSeconds: d.workSeconds,
        theoreticalSeconds: d.theoreticalSeconds,
        availability, performance, quality, oee,
      };
    });

    const totalGood               = daily.reduce((s, d) => s + d.goodQty, 0);
    const totalProduction         = daily.reduce((s, d) => s + d.productionTotal, 0);
    const totalLosses             = daily.reduce((s, d) => s + d.losses, 0);
    const totalUpSeconds          = daily.reduce((s, d) => s + (d.upSeconds || 0), 0);
    const totalWorkSeconds        = daily.reduce((s, d) => s + (d.workSeconds || 0), 0);
    const totalTheoreticalSeconds = daily.reduce((s, d) => s + (d.theoreticalSeconds || 0), 0);

    const avgAvailability = computeAvailability(totalUpSeconds, totalTheoreticalSeconds);
    const avgPerformance  = computePerformance(totalProduction, totalUpSeconds, idealThroughput);
    const avgQuality      = computeQuality(totalGood, totalProduction);
    const avgOee          = computeOee(avgAvailability, avgPerformance, avgQuality);
    const workUnits       = await ProductionDaily.distinct("workUnit");

    return res.json({
      ok: true, from, to,
      summary: {
        totalProduction, totalGood, totalLosses,
        totalUpSeconds, totalWorkSeconds, totalTheoreticalSeconds,
        avgAvailability, avgPerformance, avgQuality, avgOee,
        daysCount: daily.length,
      },
      daily, workUnits,
    });
  } catch (err) {
    console.error("KPIs query error:", err);
    return res.status(500).json({ ok: false, error: "Échec KPIs : " + err.message });
  }
});

// ─── GET /api/alerts ──────────────────────────────────────────────────────────
router.get("/alerts", async (req, res) => {
  if (!isDbConnected()) {
    return res.json({ ok: true, total: 0, count: 0, skip: 0, limit: 200, alerts: [], _noDb: true });
  }

  try {
    const filter = {};
    if (req.query.date)     filter.date     = req.query.date;
    if (req.query.workUnit) filter.workUnit  = req.query.workUnit;
    if (req.query.level)    filter.level     = req.query.level;
    if (req.query.type)     filter.type      = req.query.type;

    const sort  = { date: -1, level: 1, workUnit: 1 };
    const limit = Math.min(parseInt(req.query.limit) || 200, 2000);
    const skip  = parseInt(req.query.skip) || 0;

    const [alerts, total] = await Promise.all([
      Alert.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Alert.countDocuments(filter),
    ]);

    return res.json({ ok: true, total, count: alerts.length, skip, limit, alerts });
  } catch (err) {
    console.error("Alerts query error:", err.message);
    return res.json({ ok: true, total: 0, count: 0, skip: 0, limit: 200, alerts: [], _error: err.message });
  }
});

export default router;