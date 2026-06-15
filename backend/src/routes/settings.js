import { Router } from "express";
import Settings from "../models/Settings.js";
import User from "../models/users.js";
import DailyObjective from "../models/DailyObjective.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { isDbConnected } from "../config/db.js";
import { computeAndSaveAlerts } from "./kpis.js";

const router = Router();

const DEFAULT_SETTINGS = {
  globalObjective: 0,
  objectivesByWorkUnit: [],
  thresholds: {
    rendementWarning: 85,
    rendementCritical: 70,
    pertesWarning: 10,
    pertesCritical: 20,
  },
  forecastEnabled: true,
  updatedAt: new Date().toISOString(),
};

async function getOrCreateSettings() {
  let doc = await Settings.findOne().lean();
  if (!doc) {
    doc = await new Settings({}).save();
    doc = doc.toObject();
  }
  return doc;
}

async function refreshAlerts() {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const count = await computeAndSaveAlerts(d).catch(() => 0);
    total += count;
  }
  console.log(`[Alerts] ✅ Alertes régénérées (${total} au total)`);
  return total;
}

// ─── GET /api/settings ───────────────────────────────────────────────
router.get(
  "/settings",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    if (!isDbConnected()) {
      return res.json({ ok: true, settings: { ...DEFAULT_SETTINGS }, _noDb: true });
    }
    try {
      const settings = await getOrCreateSettings();
      res.json({ ok: true, settings });
    } catch (err) {
      console.error("Settings GET error:", err.message);
      res.json({ ok: true, settings: { ...DEFAULT_SETTINGS }, _error: err.message });
    }
  }
);

// ─── PUT /api/settings ───────────────────────────────────────────────
router.put(
  "/settings",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    if (!isDbConnected()) {
      return res.status(503).json({ ok: false, error: "Database not connected." });
    }
    try {
      const { globalObjective, objectivesByWorkUnit, thresholds, forecastEnabled } = req.body;
      const update = {};
      if (globalObjective !== undefined)     update.globalObjective = globalObjective;
      if (objectivesByWorkUnit !== undefined) update.objectivesByWorkUnit = objectivesByWorkUnit;
      if (thresholds !== undefined)           update.thresholds = thresholds;
      if (forecastEnabled !== undefined)      update.forecastEnabled = forecastEnabled;

      const doc = await Settings.findOneAndUpdate(
        {},
        { $set: update },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      if (thresholds !== undefined) {
        refreshAlerts().catch((err) => console.error("[Alerts] Error:", err.message));
      }

      res.json({ ok: true, settings: doc.toObject() });
    } catch (err) {
      console.error("Settings PUT error:", err.message);
      res.status(500).json({ ok: false, error: "Failed to save settings: " + err.message });
    }
  }
);

// ─── GET /api/settings/daily-objectives ─────────────────────────────
// ✅ CORRECTION : requireRole("manager") supprimé → accessible à tous les utilisateurs connectés
router.get(
  "/settings/daily-objectives",
  requireAuth,
  async (req, res) => {
    if (!isDbConnected()) {
      return res.status(503).json({ ok: false, error: "Database not connected." });
    }
    try {
      const filter = {};
      if (req.query.date) filter.date = req.query.date;

      const objectives = await DailyObjective.find(filter)
        .sort({ date: -1, workUnit: 1 })
        .limit(50)
        .lean();

      res.json({ ok: true, objectives });
    } catch (err) {
      console.error("DailyObjectives GET error:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ─── PUT /api/settings/daily-objective ──────────────────────────────
router.put(
  "/settings/daily-objective",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    if (!isDbConnected()) {
      return res.status(503).json({ ok: false, error: "Database not connected." });
    }
    try {
      const { date, workUnit = "global", objective } = req.body;

      if (!date || objective === undefined || objective === null) {
        return res.status(400).json({ ok: false, error: "Champs 'date' et 'objective' requis." });
      }

      const numObjective = Number(objective);
      if (isNaN(numObjective) || numObjective < 0) {
        return res.status(400).json({ ok: false, error: "L'objectif doit être un nombre positif." });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ ok: false, error: "Format de date invalide (YYYY-MM-DD attendu)." });
      }

      const doc = await DailyObjective.findOneAndUpdate(
        { date, workUnit },
        { $set: { objective: numObjective } },
        { new: true, upsert: true, runValidators: true }
      );

      console.log(`[DailyObjective] ✅ ${date} / ${workUnit} → ${numObjective}`);
      res.json({ ok: true, objective: doc.toObject() });
    } catch (err) {
      console.error("DailyObjective PUT error:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ─── DELETE /api/settings/daily-objective/:id ───────────────────────
router.delete(
  "/settings/daily-objective/:id",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    if (!isDbConnected()) {
      return res.status(503).json({ ok: false, error: "Database not connected." });
    }
    try {
      const deleted = await DailyObjective.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "Objectif introuvable." });
      }
      res.json({ ok: true, deleted: true });
    } catch (err) {
      console.error("DailyObjective DELETE error:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ─── GET /api/employees/search ───────────────────────────────────────
router.get(
  "/employees/search",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    const name = req.query.name?.trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: "Paramètre 'name' requis." });
    }
    if (!isDbConnected()) {
      return res.status(503).json({ ok: false, error: "Database not connected." });
    }
    try {
      const regex = new RegExp(name, "i");
      const users = await User.find({ role: "admin", username: regex })
        .select("-password")
        .sort({ username: 1 })
        .limit(20)
        .lean();

      const employees = users.map((u) => ({
        _id:         u._id,
        name:        u.username,
        department:  `Admin · ${u.permissions?.length ?? 0} accès`,
        permissions: u.permissions,
        createdAt:   u.createdAt,
      }));

      res.json({ ok: true, employees });
    } catch (err) {
      console.error("Employee search error:", err.message);
      res.status(500).json({ ok: false, error: "Erreur lors de la recherche : " + err.message });
    }
  }
);

export default router;