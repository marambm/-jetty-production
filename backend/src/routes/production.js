import { Router } from "express";
import ProductionDaily from "../models/ProductionDaily.js";

const router = Router();

// ── Helper : calcule les KPIs d'un enregistrement ────────────────────────────
function computeKpis(r) {
  const productionTotal = (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0);
  const lossesQty       = (r.defectsQty || 0) + (r.scrapQty || 0);
  const yieldPct        = productionTotal > 0
    ? Number(((r.goodQty / productionTotal) * 100).toFixed(2))
    : 0;
  return { ...r, productionTotal, lossesQty, yieldPct };
}

// ============================================================
// GET /production
// ============================================================
router.get("/production", async (req, res) => {
  try {
    const filter = {};

    if (req.query.workUnit && req.query.workUnit !== "all") {
      filter.workUnit = req.query.workUnit;
    }

    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = req.query.from;
      if (req.query.to)   filter.date.$lte = req.query.to;
    } else if (req.query.date) {
      filter.date = req.query.date;
    }

    const limit  = Math.min(parseInt(req.query.limit) || 500, 5000);
    const skip   = parseInt(req.query.skip) || 0;
    const byUnit = req.query.byUnit === "true";

    let records = [];
    let total   = 0;
    let fallback = false;      // ← indique si on a utilisé le fallback
    let fallbackDate = null;   // ← date réelle des données retournées

    // ── Fonction utilitaire : tente la requête, si vide → fallback ────────────
    async function queryWithFallback(f) {
      let count = await ProductionDaily.countDocuments(f);

      if (count === 0 && (f.date || (req.query.from || req.query.to))) {
        // Aucune donnée pour la période → chercher la dernière date disponible
        const unitFilter = f.workUnit ? { workUnit: f.workUnit } : {};
        const lastDoc = await ProductionDaily.findOne(unitFilter)
          .sort({ date: -1 })
          .select("date")
          .lean();

        if (lastDoc) {
          fallback = true;
          fallbackDate = lastDoc.date;
          // Nouveau filtre : exactement la dernière date
          const newFilter = { ...unitFilter, date: lastDoc.date };
          count = await ProductionDaily.countDocuments(newFilter);
          return newFilter;
        }
      }
      return f;
    }

    if (!req.query.workUnit || req.query.workUnit === "all") {
      if (byUnit) {
        const activeFilter = await queryWithFallback(filter);
        records = await ProductionDaily.find(activeFilter).sort({ date: 1 }).skip(skip).limit(limit).lean();
        total   = await ProductionDaily.countDocuments(activeFilter);
        records = records.map(computeKpis);
      } else {
        // Pour l'agrégation, vérifier d'abord si des données existent
        const activeFilter = await queryWithFallback(filter);
        records = await ProductionDaily.aggregate([
          { $match: activeFilter },
          {
            $group: {
              _id:                "$date",
              goodQty:            { $sum: { $ifNull: ["$goodQty", 0] } },
              defectsQty:         { $sum: { $ifNull: ["$defectsQty", 0] } },
              scrapQty:           { $sum: { $ifNull: ["$scrapQty", 0] } },
              workSeconds:        { $sum: { $ifNull: ["$workSeconds", 0] } },
              theoreticalSeconds: { $sum: { $ifNull: ["$theoreticalSeconds", 0] } },
            },
          },
          {
            $addFields: {
              productionTotal: { $add: ["$goodQty", "$defectsQty", "$scrapQty"] },
              lossesQty:       { $add: ["$defectsQty", "$scrapQty"] },
            },
          },
          {
            $addFields: {
              yieldPct: {
                $cond: [
                  { $gt: ["$productionTotal", 0] },
                  { $round: [{ $multiply: [{ $divide: ["$goodQty", "$productionTotal"] }, 100] }, 2] },
                  0,
                ],
              },
            },
          },
          {
            $project: {
              _id: 0, date: "$_id", workUnit: "ALL",
              goodQty: 1, defectsQty: 1, scrapQty: 1,
              workSeconds: 1, theoreticalSeconds: 1,
              productionTotal: 1, lossesQty: 1, yieldPct: 1,
            },
          },
          { $sort: { date: 1 } },
          { $skip: skip },
          { $limit: limit },
        ]);
        total = records.length;
      }
    } else {
      const activeFilter = await queryWithFallback(filter);
      records = await ProductionDaily.find(activeFilter).sort({ date: 1 }).skip(skip).limit(limit).lean();
      total   = await ProductionDaily.countDocuments(activeFilter);
      records = records.map(computeKpis);
    }

    const workUnits = await ProductionDaily.distinct("workUnit");
    res.json({
      ok: true,
      total,
      count: records.length,
      skip,
      limit,
      workUnits,
      records,
      fallback,          // ← true si données d'une autre période
      fallbackDate,      // ← date réelle des données
    });

  } catch (err) {
    console.error("Production query error:", err);
    res.status(500).json({ ok: false, error: "Query failed: " + err.message });
  }
});

// ============================================================
// POST /production  — créer un enregistrement
// ============================================================
router.post("/production", async (req, res) => {
  try {
    const doc = new ProductionDaily(req.body);
    await doc.save();

    await req.audit?.logCreate({
      collection: "ProductionDaily",
      document:   doc,
      note:       `Création enregistrement ${doc.workUnit} du ${doc.date}`,
    });

    res.status(201).json({ ok: true, record: doc });
  } catch (err) {
    console.error("Production create error:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ============================================================
// PUT /production/:id  — modifier un enregistrement
// ============================================================
router.put("/production/:id", async (req, res) => {
  try {
    const before = await ProductionDaily.findById(req.params.id).lean();
    if (!before) {
      return res.status(404).json({ ok: false, error: "Record not found" });
    }

    const doc = await ProductionDaily.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    await req.audit?.logUpdate({
      collection: "ProductionDaily",
      before,
      after:      doc,
      note:       `Modification enregistrement ${doc.workUnit} du ${doc.date}`,
    });

    res.json({ ok: true, record: doc });
  } catch (err) {
    console.error("Production update error:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ============================================================
// DELETE /production/:id  — supprimer un enregistrement
// ============================================================
router.delete("/production/:id", async (req, res) => {
  try {
    const doc = await ProductionDaily.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "Record not found" });
    }

    await req.audit?.logDelete({
      collection: "ProductionDaily",
      document:   doc,
      note:       `Suppression enregistrement ${doc.workUnit} du ${doc.date}`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Production delete error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;