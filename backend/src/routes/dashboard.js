import { Router } from "express";
import axios from "axios";
import ProductionDaily from "../models/ProductionDaily.js";
import Forecast from "../models/Forecast.js";
import DailyObjective from "../models/DailyObjective.js";
import { isDbConnected } from "../config/db.js";

const router = Router();
const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const EMPTY_TOTALS = {
  goodQty: 0, defectsQty: 0, scrapQty: 0,
  productionTotal: 0, yield: 0, losses: 0, workSeconds: 0,
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function normalizeDate(raw) {
  if (!raw) return todayStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [mm, dd, yyyy] = raw.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [mm, dd, yyyy] = raw.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return todayStr();
}

function dateDaysAgo(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function dateAddDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function calcYield(good, total) {
  return total > 0 ? Number(((good / total) * 100).toFixed(2)) : 0;
}

async function fetchForecastForTomorrow(date) {
  const tomorrow = dateAddDays(date, 1);
  try {
    const stored = await Forecast.findOne({ forecastForDate: tomorrow }).lean();
    if (stored) {
      return {
        forecastForDate: stored.forecastForDate,
        workUnit:        stored.workUnit,
        yhat:            stored.yhat,
        yhatLower:       stored.yhatLower,
        yhatUpper:       stored.yhatUpper,
        confidence:      stored.confidence ?? 75,
        modelVersion:    stored.modelVersion,
      };
    }

    const lastRow = await ProductionDaily.findOne({ date: { $lte: date } })
      .sort({ date: -1 })
      .lean();
    if (!lastRow) return null;

    const features = {};
    if (lastRow.workSeconds) features.workSeconds = lastRow.workSeconds;

    const aiRes = await axios.post(
      `${AI_URL}/predict`,
      { date: tomorrow, workUnit: lastRow.workUnit, features },
      { timeout: 10000 }
    );

    return {
      forecastForDate: tomorrow,
      workUnit:     lastRow.workUnit,
      yhat:         aiRes.data.yhat,
      yhatLower:    aiRes.data.yhat_lower,
      yhatUpper:    aiRes.data.yhat_upper,
      confidence:   aiRes.data.confidence,
      modelVersion: aiRes.data.model_version,
    };
  } catch (err) {
    console.warn("Forecast fetch skipped:", err.message);
    return null;
  }
}

// ─── Résout l'objectif effectif pour un jour donné ───────────────────
// Priorité : objectif journalier spécifique > objectif journalier global > null
async function resolveDailyObjective(date, workUnit) {
  try {
    // 1. Cherche un objectif spécifique à cette unité pour ce jour
    if (workUnit) {
      const specific = await DailyObjective.findOne({ date, workUnit }).lean();
      if (specific) return { value: specific.objective, source: "daily-specific", id: specific._id };
    }

    // 2. Cherche un objectif global pour ce jour
    const global = await DailyObjective.findOne({ date, workUnit: "global" }).lean();
    if (global) return { value: global.objective, source: "daily-global", id: global._id };

    return null;
  } catch {
    return null;
  }
}

router.get("/dashboard", async (req, res) => {
  const date           = normalizeDate(req.query.date);
  const workUnitFilter = req.query.workUnit || null;

  if (!isDbConnected()) {
    return res.json({
      ok: true, date,
      totals: { ...EMPTY_TOTALS },
      byWorkUnit: [], series: [], forecast: null,
      dailyObjective: null,
      _noDb: true,
    });
  }

  try {
    const seriesStart = dateDaysAgo(date, 29);

    const dayMatch    = { date };
    if (workUnitFilter) dayMatch.workUnit = workUnitFilter;

    const seriesMatch = { date: { $gte: seriesStart, $lte: date } };
    if (workUnitFilter) seriesMatch.workUnit = workUnitFilter;

    const [byWorkUnit, seriesRaw, forecast, dailyObjective] = await Promise.all([
      ProductionDaily.aggregate([
        { $match: dayMatch },
        {
          $group: {
            _id:                "$workUnit",
            goodQty:            { $sum: "$goodQty" },
            defectsQty:         { $sum: "$defectsQty" },
            scrapQty:           { $sum: "$scrapQty" },
            workSeconds:        { $sum: "$workSeconds" },
            theoreticalSeconds: { $sum: "$theoreticalSeconds" },
          },
        },
        {
          $project: {
            _id: 0, workUnit: "$_id",
            goodQty: 1, defectsQty: 1, scrapQty: 1,
            workSeconds: 1, theoreticalSeconds: 1,
            productionTotal: { $add: ["$goodQty", "$defectsQty", "$scrapQty"] },
            losses:          { $add: ["$defectsQty", "$scrapQty"] },
          },
        },
        { $sort: { workUnit: 1 } },
      ]),

      ProductionDaily.aggregate([
        { $match: seriesMatch },
        {
          $group: {
            _id:         "$date",
            goodQty:     { $sum: "$goodQty" },
            defectsQty:  { $sum: "$defectsQty" },
            scrapQty:    { $sum: "$scrapQty" },
            workSeconds: { $sum: "$workSeconds" },
          },
        },
        {
          $project: {
            _id: 0, date: "$_id",
            goodQty: 1, defectsQty: 1, scrapQty: 1, workSeconds: 1,
            productionTotal: { $add: ["$goodQty", "$defectsQty", "$scrapQty"] },
            losses:          { $add: ["$defectsQty", "$scrapQty"] },
          },
        },
        { $sort: { date: 1 } },
      ]),

      fetchForecastForTomorrow(date),

      // Objectif journalier : spécifique à l'unité filtrée, ou global
      resolveDailyObjective(date, workUnitFilter),
    ]);

    const enriched = byWorkUnit.map((wu) => ({
      ...wu,
      yield: calcYield(wu.goodQty, wu.productionTotal),
    }));

    const totals = enriched.reduce(
      (acc, wu) => {
        acc.goodQty         += wu.goodQty;
        acc.defectsQty      += wu.defectsQty;
        acc.scrapQty        += wu.scrapQty;
        acc.productionTotal += wu.productionTotal;
        acc.losses          += wu.losses;
        acc.workSeconds     += wu.workSeconds;
        return acc;
      },
      { goodQty: 0, defectsQty: 0, scrapQty: 0, productionTotal: 0, losses: 0, workSeconds: 0 }
    );
    totals.yield = calcYield(totals.goodQty, totals.productionTotal);

    res.json({
      ok: true, date, totals,
      byWorkUnit: enriched,
      series:     seriesRaw,
      forecast,
      // null si aucun objectif journalier, sinon { value, source }
      dailyObjective,
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.json({
      ok: true, date,
      totals:         { ...EMPTY_TOTALS },
      byWorkUnit:     [],
      series:         [],
      forecast:       null,
      dailyObjective: null,
      _error:         err.message,
    });
  }
});

export default router;