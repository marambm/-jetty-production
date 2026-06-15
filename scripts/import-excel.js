import XLSX from "xlsx";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../backend/.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) {
  console.error("[Import] MONGODB_URI not found in environment");
  process.exit(1);
}

const FILE_PATH = process.argv[2] || "attached_assets/create_by_epichust_(1)_1771597357800.xls";

function cleanHeader(s) {
  return s.replace(/<[^>]*>/g, "").trim();
}

const COLUMN_MAP = {
  "Collection time": "collectionTime",
  "Work unit name": "workUnit",
  "Good product quantity": "goodQty",
  "Number of defective products": "defectsQty",
  "Scrap quantity": "scrapQty",
  "Work hours (seconds)": "workSeconds",
  "Theoretical working time of the workpiece": "theoreticalPerPiece",
};

function parseDate(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

async function main() {
  console.log("[Import] Reading Excel file:", FILE_PATH);

  const wb = XLSX.readFile(FILE_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`[Import] Found ${rawRows.length} raw rows in sheet "${wb.SheetNames[0]}"`);

  const rows = rawRows.map((raw) => {
    const mapped = {};
    for (const [key, val] of Object.entries(raw)) {
      const cleaned = cleanHeader(key);
      if (COLUMN_MAP[cleaned]) {
        mapped[COLUMN_MAP[cleaned]] = val;
      }
    }
    return mapped;
  });

  const groups = {};
  for (const row of rows) {
    const date = parseDate(row.collectionTime);
    const workUnit = String(row.workUnit || "").trim();
    if (!date || !workUnit) {
      console.warn("[Import] Skipping row - missing date or workUnit:", row);
      continue;
    }

    const key = `${date}|${workUnit}`;
    if (!groups[key]) {
      groups[key] = { date, workUnit, goodQty: 0, defectsQty: 0, scrapQty: 0, workSeconds: 0, theoreticalSeconds: 0 };
    }

    const g = groups[key];
    const good = Number(row.goodQty) || 0;
    g.goodQty += good;
    g.defectsQty += Number(row.defectsQty) || 0;
    g.scrapQty += Number(row.scrapQty) || 0;
    g.workSeconds += Number(row.workSeconds) || 0;
    g.theoreticalSeconds += (Number(row.theoreticalPerPiece) || 0) * good;
  }

  const records = Object.values(groups);
  console.log(`[Import] Aggregated into ${records.length} unique (date, workUnit) records:`);
  for (const r of records) {
    console.log(`  ${r.date} | ${r.workUnit} | good=${r.goodQty} defects=${r.defectsQty} scrap=${r.scrapQty} workSec=${r.workSeconds} theoSec=${r.theoreticalSeconds}`);
  }

  console.log("[Import] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("[Import] Connected to MongoDB");

  const ProductionDaily = mongoose.model(
    "ProductionDaily",
    new mongoose.Schema({
      date: String,
      workUnit: String,
      goodQty: Number,
      defectsQty: Number,
      scrapQty: Number,
      workSeconds: Number,
      theoreticalSeconds: Number,
    }),
    "production_daily"
  );

  const ops = records.map((r) => ({
    updateOne: {
      filter: { date: r.date, workUnit: r.workUnit },
      update: { $set: r },
      upsert: true,
    },
  }));

  const result = await ProductionDaily.bulkWrite(ops);
  console.log(`[Import] bulkWrite result: matched=${result.matchedCount} upserted=${result.upsertedCount} modified=${result.modifiedCount}`);

  await mongoose.disconnect();
  console.log("[Import] Done. MongoDB disconnected.");
}

main().catch((err) => {
  console.error("[Import] Error:", err);
  process.exit(1);
});
