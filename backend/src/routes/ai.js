import { Router } from "express";
import axios from "axios";
import ProductionDaily from "../models/ProductionDaily.js";
import Forecast from "../models/Forecast.js";

const router = Router();
const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

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

router.get("/health", async (_req, res) => {
  try {
    const response = await axios.get(`${AI_URL}/health`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ status: "unreachable", service: "ai-service", error: err.message });
  }
});

router.post("/train", async (req, res) => {
  try {
    const workUnit  = req.query.workUnit || req.body.workUnit;
    // ✅ 180j pour atteindre ~100 enregistrements réels (palier optimal XGBoost)
    const days      = parseInt(req.query.days || req.body.days || "180", 10);
    const today     = req.query.date || new Date().toISOString().split("T")[0];
    const startDate = dateDaysAgo(today, days - 1);

    const query = { date: { $gte: startDate, $lte: today } };
    if (workUnit) query.workUnit = workUnit;

    const rows = await ProductionDaily.find(query).sort({ date: 1, workUnit: 1 }).lean();

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "No production data found for the given criteria" });
    }

    const records = rows.map((r) => ({
      date:        r.date,
      workUnit:    r.workUnit,
      // ✅ y = production totale
      y:           (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0),
      workSeconds: r.workSeconds || 0,
    }));

    const aiRes = await axios.post(`${AI_URL}/train`, { records }, { timeout: 60000 });
    res.json({ ok: true, trainedOn: records.length, ...aiRes.data });
  } catch (err) {
    console.error("AI train error:", err.response?.data || err.message);
    const status = err.response?.status || 500;
    const detail = err.response?.data?.detail || err.message;
    res.status(status).json({ ok: false, error: detail });
  }
});

router.get("/forecast", async (req, res) => {
  try {
    const date     = req.query.date || new Date().toISOString().split("T")[0];
    const workUnit = req.query.workUnit;

    if (!workUnit) {
      return res.status(400).json({ ok: false, error: "workUnit query parameter is required" });
    }

    const forecastDate = dateAddDays(date, 1);

    // ✅ workSeconds uniquement — l'historique est géré par le modèle Python
    const recentRow = await ProductionDaily.findOne({
      workUnit,
      date: { $lte: date },
    })
      .sort({ date: -1 })
      .lean();

    const features = {};
    if (recentRow?.workSeconds) {
      features.workSeconds = recentRow.workSeconds;
    }

    const aiRes = await axios.post(
      `${AI_URL}/predict`,
      { date: forecastDate, workUnit, features },
      { timeout: 15000 }
    );

    const forecastData = aiRes.data;

    await Forecast.findOneAndUpdate(
      { forecastForDate: forecastDate, workUnit },
      {
        forecastForDate: forecastDate,
        workUnit,
        yhat:         forecastData.yhat,
        yhatLower:    forecastData.yhat_lower,
        yhatUpper:    forecastData.yhat_upper,
        modelVersion: forecastData.model_version,
      },
      { upsert: true, new: true }
    );

    res.json({
      ok: true,
      forecast: {
        forecastForDate: forecastDate,
        workUnit,
        yhat:         forecastData.yhat,
        yhatLower:    forecastData.yhat_lower,
        yhatUpper:    forecastData.yhat_upper,
        confidence:   forecastData.confidence,
        modelVersion: forecastData.model_version,
      },
    });
  } catch (err) {
    console.error("Forecast error:", err.response?.data || err.message);
    const status = err.response?.status || 500;
    const detail = err.response?.data?.detail || err.message;
    res.status(status).json({ ok: false, error: detail });
  }
});

export default router;