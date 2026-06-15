import { Router } from "express";
import axios from "axios";
import ProductionDaily from "../models/ProductionDaily.js";
import Forecast from "../models/Forecast.js";
import { isDbConnected } from "../config/db.js";

const router = Router();
const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// ── IA health cache ───────────────────────────────────────────────────────────
let aiAvailable = null;
let aiCheckTime = 0;
const AI_CHECK_INTERVAL = 60_000;

async function checkAiAvailable() {
  const now = Date.now();
  if (aiAvailable !== null && now - aiCheckTime < AI_CHECK_INTERVAL) return aiAvailable;
  try {
    await axios.get(`${AI_URL}/health`, { timeout: 2000 });
    aiAvailable = true;
    console.log("[AI] ✅ Serveur IA disponible :", AI_URL);
  } catch (err) {
    aiAvailable = false;
    console.warn("[AI] ⚠️  Serveur IA indisponible :", AI_URL, "→", err.message);
  }
  aiCheckTime = now;
  return aiAvailable;
}

// ── Paramètres d'early stopping ───────────────────────────────────────────────
// Centralisés ici pour être facilement ajustables sans toucher à la logique
const EARLY_STOP_CONFIG = {
  patience:  15,   // itérations sans amélioration avant arrêt
  max_iter:  500,  // plafond de sécurité
  min_delta: 0.5,  // amélioration minimale en pcs pour compter
};

// ── Track trained units + leurs métriques ────────────────────────────────────
const trainedUnits = new Map();

async function ensureModelTrained(wu, records) {
  const existing     = trainedUnits.get(wu);
  const currentCount = records.length;

  const shouldTrain =
    !existing ||
    (currentCount - existing.recordCount) / Math.max(existing.recordCount, 1) > 0.1;

  if (!shouldTrain) return true;

  if (records.length < 30) {
    console.warn(`[AI] ⚠️  Pas assez de données pour entraîner ${wu} (${records.length} records, min 30)`);
    return false;
  }

  try {
    console.log(`[AI] 🏋️  Entraînement du modèle pour ${wu} (${records.length} records)...`);

    const trainRecords = records.map((r) => ({
      date:        r.date,
      workUnit:    r.workUnit,
      y:           (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0),
      workSeconds: r.workSeconds || 0,
    }));

    const trainRes = await axios.post(
      `${AI_URL}/train`,
      {
        records:        trainRecords,
        early_stopping: EARLY_STOP_CONFIG,   // ← transmis au service Python
      },
      { timeout: 60_000 }
    );

    const trainedModel = trainRes.data?.models?.find((m) => m.work_unit === wu);

    // Récupérer les infos d'early stopping renvoyées par le service Python
    // (stopped_at_iter et best_rmse sont optionnels — rétrocompatible)
    const es = trainedModel?.early_stopping ?? {};

    trainedUnits.set(wu, {
      trainedAt:      Date.now(),
      recordCount:    currentCount,
      mae:            trainedModel?.metrics?.mae       ?? null,
      rmse:           trainedModel?.metrics?.rmse      ?? null,
      testSize:       trainedModel?.metrics?.test_size ?? null,
      // Métriques early stopping (null si le service Python ne les renvoie pas encore)
      stoppedAtIter:  es.stopped_at_iter ?? null,
      bestTestRmse:   es.best_rmse       ?? null,
      earlyStoppped:  es.triggered       ?? false,
    });

    const esInfo = es.triggered
      ? ` | ⏹ early-stop iter=${es.stopped_at_iter} bestRMSE=${es.best_rmse?.toFixed(2)}`
      : "";

    console.log(
      `[AI] ✅ Modèle entraîné pour ${wu} — ` +
      `MAE=${trainedModel?.metrics?.mae?.toFixed(2)} ` +
      `RMSE=${trainedModel?.metrics?.rmse?.toFixed(2)}` +
      esInfo
    );
    return true;
  } catch (err) {
    console.error(`[AI] ❌ Erreur entraînement ${wu} :`, err.response?.data || err.message);
    return false;
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
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

// ── Valeur journalière pour un workUnit (réel ou prédit) ─────────────────────
// Retourne { value, source: "actual"|"ai", date }
async function getDayValue(dateStr, wu, wuRecords, previousPredictions, wuMeta) {
  // 1. Valeur réelle ?
  const real = await ProductionDaily.findOne({ date: dateStr, workUnit: wu }).lean();
  if (real) {
    const total = (real.goodQty ?? 0) + (real.defectsQty ?? 0) + (real.scrapQty ?? 0);
    return { value: total, source: "actual", date: dateStr };
  }

  // 2. Cache MongoDB ?
  const stored = await Forecast.findOne({
    forecastForDate: dateStr,
    workUnit:        wu,
    source:          "ai",
  }).lean();

  if (stored) {
    if (wuMeta?.mae != null && (stored.mae == null || stored.rmse == null)) {
      await Forecast.updateOne(
        { forecastForDate: dateStr, workUnit: wu },
        { $set: { mae: wuMeta.mae, rmse: wuMeta.rmse, testSize: wuMeta.testSize } }
      ).catch(() => {});
    }
    return { value: stored.yhat, source: "ai", date: dateStr, stored };
  }

  // 3. Appel Python /predict
  try {
    const lastRecord = wuRecords[0];
    const features   = lastRecord?.workSeconds ? { workSeconds: lastRecord.workSeconds } : {};

    const aiRes = await axios.post(
      `${AI_URL}/predict`,
      { date: dateStr, workUnit: wu, features, previous_predictions: previousPredictions },
      { timeout: 5000 }
    );
    const raw = aiRes.data;

    const confidenceRaw = raw.confidence ?? 0.75;
    const confidence    = confidenceRaw <= 1
      ? Math.round(confidenceRaw * 100)
      : Math.round(confidenceRaw);

    const aiResult = {
      yhat:         raw.yhat,
      yhatLower:    raw.yhat_lower ?? raw.yhatLower ?? 0,
      yhatUpper:    raw.yhat_upper ?? raw.yhatUpper ?? 0,
      confidence,
      modelVersion: raw.model_version ?? raw.modelVersion ?? "ai",
    };

    // Sauvegarder en cache
    await Forecast.findOneAndUpdate(
      { forecastForDate: dateStr, workUnit: wu },
      {
        $set: {
          ...aiResult,
          source:   "ai",
          mae:      wuMeta?.mae      ?? null,
          rmse:     wuMeta?.rmse     ?? null,
          testSize: wuMeta?.testSize ?? null,
        },
      },
      { upsert: true }
    ).catch((e) => console.error("[DB] Upsert forecast error:", e.message));

    console.log(`[AI] ✅ ${wu} ${dateStr} → yhat=${aiResult.yhat} conf=${confidence}%`);
    return { value: aiResult.yhat, source: "ai", date: dateStr, aiResult };

  } catch (aiErr) {
    console.warn(`[AI] ⚠️  Erreur prédiction ${wu} ${dateStr} :`, aiErr.response?.data || aiErr.message);
    if (aiErr.response?.status === 404) trainedUnits.delete(wu);
    return null; // jour ignoré
  }
}

// ── /forecast route ───────────────────────────────────────────────────────────
router.get("/forecast", async (req, res) => {
  if (!isDbConnected()) {
    return res.json({ ok: true, forecasts: [], _noDb: true });
  }

  try {
    const today          = new Date().toISOString().split("T")[0];
    const baseDate       = req.query.date || today;
    const workUnitFilter = req.query.workUnit || null;

    const HORIZONS = [3, 7, 14];

    const recentStart = dateDaysAgo(baseDate, 179);
    const recentMatch = { date: { $gte: recentStart, $lte: baseDate } };
    if (workUnitFilter) recentMatch.workUnit = workUnitFilter;

    const recentData = await ProductionDaily.find(recentMatch).sort({ date: -1 }).lean();

    const workUnitGroups = {};
    for (const r of recentData) {
      if (!workUnitGroups[r.workUnit]) workUnitGroups[r.workUnit] = [];
      workUnitGroups[r.workUnit].push(r);
    }

    const workUnits = Object.keys(workUnitGroups).sort();
    const useAi     = await checkAiAvailable();

    if (!useAi) {
      console.warn("[AI] ⚠️  Service IA indisponible — aucune prévision retournée");
      return res.json({
        ok:             true,
        baseDate,
        horizons:       HORIZONS,
        results:        [],
        workUnits:      await ProductionDaily.distinct("workUnit"),
        periodMetrics:  null,
        _aiUnavailable: true,
      });
    }

    const results = [];

    for (const wu of workUnits) {
      const wuRecords  = workUnitGroups[wu];
      const modelReady = await ensureModelTrained(wu, wuRecords);
      if (!modelReady) {
        console.warn(`[AI] ⚠️  Modèle non prêt pour ${wu} — ignoré`);
        continue;
      }

      const wuMeta     = trainedUnits.get(wu);
      const maxHorizon = Math.max(...HORIZONS);

      const dayValues           = [];
      const previousPredictions = [];

      for (let d = 0; d <= maxHorizon; d++) {
        const dayDate = dateAddDays(baseDate, d);
        const result  = await getDayValue(dayDate, wu, wuRecords, previousPredictions, wuMeta);

        if (!result) continue;

        dayValues.push({ date: dayDate, value: result.value, source: result.source });

        if (result.source === "ai") {
          previousPredictions.push(result.value);
        }
      }

      const horizonsResult = {};
      for (const h of HORIZONS) {
        const windowDays = dayValues.filter((dv) => {
          const idx = dayValues.indexOf(dv);
          return idx <= h && idx <= dayValues.length - 1;
        });

        const total         = windowDays.reduce((s, dv) => s + dv.value, 0);
        const actualDays    = windowDays.filter((dv) => dv.source === "actual").length;
        const predictedDays = windowDays.filter((dv) => dv.source === "ai").length;
        const totalSafe     = Math.max(0, Math.round(total));

        horizonsResult[`j+${h}`] = {
          total:         totalSafe,
          days:          windowDays,
          actualDays,
          predictedDays,
          coverage:      `${actualDays} réels / ${predictedDays} prédits`,
        };

        console.log(
          `[Forecast] 📊 ${wu} j+${h} depuis ${baseDate} → ` +
          `total=${Math.round(total)} (${actualDays} réels + ${predictedDays} prédits)`
        );
      }

      // Exposer les métriques d'early stopping dans la réponse par workUnit
      results.push({
        workUnit: wu,
        horizons: horizonsResult,
        ...(wuMeta?.earlyStoppped && {
          earlyStop: {
            triggered:     true,
            stoppedAtIter: wuMeta.stoppedAtIter,
            bestTestRmse:  wuMeta.bestTestRmse,
          },
        }),
      });
    }

    // ── periodMetrics ─────────────────────────────────────────────────────────
    const pastForecastMatch = {
      forecastForDate: { $gte: recentStart, $lte: baseDate },
      source:          "ai",
    };
    if (workUnitFilter) pastForecastMatch.workUnit = workUnitFilter;

    const pastForecasts  = await Forecast.find(pastForecastMatch).lean();
    const realByDateUnit = {};
    for (const r of recentData) {
      realByDateUnit[`${r.date}|${r.workUnit}`] =
        (r.goodQty ?? 0) + (r.defectsQty ?? 0) + (r.scrapQty ?? 0);
    }

    const comparisonPoints = [];
    for (const pf of pastForecasts) {
      const real = realByDateUnit[`${pf.forecastForDate}|${pf.workUnit}`];
      if (real != null) {
        comparisonPoints.push({ ecart: pf.yhat - real });
      }
    }

    let periodMetrics = null;
    if (comparisonPoints.length >= 2) {
      const mae  = comparisonPoints.reduce((s, p) => s + Math.abs(p.ecart), 0) / comparisonPoints.length;
      const rmse = Math.sqrt(
        comparisonPoints.reduce((s, p) => s + p.ecart * p.ecart, 0) / comparisonPoints.length
      );
      periodMetrics = { mae: Math.round(mae), rmse: Math.round(rmse), n: comparisonPoints.length };
    }

    // ── History agrégée ───────────────────────────────────────────────────────
    const historySeries = await ProductionDaily.aggregate([
      { $match: recentMatch },
      {
        $group: {
          _id:             "$date",
          productionTotal: { $sum: { $add: ["$goodQty", "$defectsQty", "$scrapQty"] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      ok:           true,
      baseDate,
      horizons:     HORIZONS,
      results,
      history:      historySeries.map((s) => ({ date: s._id, productionTotal: s.productionTotal })),
      workUnits:    await ProductionDaily.distinct("workUnit"),
      periodMetrics,
    });

  } catch (err) {
    console.error("[Forecast] Erreur globale :", err);
    res.status(500).json({ ok: false, error: "Forecast failed: " + err.message });
  }
});

// ── /forecast/clear-cache ─────────────────────────────────────────────────────
router.delete("/forecast/clear-cache", async (req, res) => {
  try {
    const wu     = req.query.workUnit;
    const filter = wu ? { workUnit: wu } : {};
    const result = await Forecast.deleteMany(filter);
    trainedUnits.clear();
    aiAvailable = null;
    aiCheckTime = 0;
    res.json({
      ok:      true,
      deleted: result.deletedCount,
      message: "Cache vidé, réentraînement au prochain appel",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;