import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import { requireAuth } from "../middlewares/auth.js";
import { isDbConnected } from "../config/db.js";

const router = Router();

// ── GET /api/audit  — paginated list with filters ─────────────────────────────
// Query params:
//   collection  — filter by model name (e.g. "ProductionDaily")
//   documentId  — filter by document id
//   userId      — filter by author
//   action      — CREATE | UPDATE | DELETE
//   from / to   — ISO date strings
//   page        — default 1
//   limit       — default 50, max 200
router.get("/", requireAuth, async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

  try {
    const { collection, documentId, userId, action, from, to, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (collection)  filter.collection  = collection;
    if (documentId)  filter.documentId  = documentId;
    if (userId)      filter.userId      = userId;
    if (action)      filter.action      = action.toUpperCase();
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to)   filter.timestamp.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const safeLimit = Math.min(Number(limit), 200);
    const skip      = (Number(page) - 1) * safeLimit;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
    ]);

    res.json({ ok: true, total, page: Number(page), limit: safeLimit, logs });
  } catch (err) {
    console.error("Audit list error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/audit/document/:id  — full history for one document ──────────────
router.get("/document/:id", requireAuth, async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

  try {
    const logs = await AuditLog.find({ documentId: req.params.id })
      .sort({ timestamp: -1 })
      .lean();
    res.json({ ok: true, logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/audit/stats  — aggregated stats for a date range ─────────────────
// Returns: actions per day, top users, actions by collection
router.get("/stats", requireAuth, async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    const match = Object.keys(dateFilter).length ? { timestamp: dateFilter } : {};

    const [byAction, byUser, byCollection, byDay] = await Promise.all([
      AuditLog.aggregate([
        { $match: match },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: match },
        { $group: { _id: "$userName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $match: match },
        { $group: { _id: "$collection", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ ok: true, stats: { byAction, byUser, byCollection, byDay } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/audit/purge  — delete logs older than N days (admin only) ─────
router.delete("/purge", requireAuth, async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

  // Optionally: check req.user.role === "admin"
  try {
    const days     = Math.max(Number(req.query.olderThanDays) || 365, 30); // floor 30 days
    const cutoff   = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { deletedCount } = await AuditLog.deleteMany({ timestamp: { $lt: cutoff } });
    res.json({ ok: true, deletedCount, cutoff });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;