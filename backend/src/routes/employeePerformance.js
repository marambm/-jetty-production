// routes/employeePerformance.js
import { Router } from "express";
import ProductionDaily from "../models/ProductionDaily.js";

const router = Router();

// ─── Utilitaires date ─────────────────────────────────────────────────────────
function getWeekBounds(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=dim, 1=lun...
  const toMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + toMonday - weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    start: monday.toISOString().slice(0, 10),
    end:   friday.toISOString().slice(0, 10),
  };
}

// ─── GET /api/employee-performance/weekly?week=0 ──────────────────────────────
router.get("/weekly", async (req, res) => {
  try {
    const weekOffset = Math.max(0, parseInt(req.query.week ?? "0"));
    const { start, end } = getWeekBounds(weekOffset);

    const records = await ProductionDaily.find({
      date: { $gte: start, $lte: end },
    }).lean();

    if (records.length === 0) {
      return res.json({
        ok: true,
        weekStart: start,
        weekEnd: end,
        employees: [],
        topEmployee: null,
      });
    }

    // ─── Agrégation par employé ───────────────────────────────────────────
    const byEmployee = {};
    for (const r of records) {
      const empId = r.employeeId || "UNKNOWN";
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          employeeId:   empId,
          employeeName: r.employeeName || "Inconnu",
          department:   r.department   || "Production",
          goodQty:      0,
          defectsQty:   0,
          scrapQty:     0,
          workSeconds:  0,
          daysWorked:   0,
        };
      }
      const e = byEmployee[empId];
      e.goodQty     += r.goodQty     || 0;
      e.defectsQty  += r.defectsQty  || 0;
      e.scrapQty    += r.scrapQty    || 0;
      e.workSeconds += r.workSeconds || 0;
      e.daysWorked  += 1;
    }

    // ─── Calcul du score de performance ──────────────────────────────────
    const employees = Object.values(byEmployee).map((e) => {
      const total       = e.goodQty + e.defectsQty + e.scrapQty;
      const qualityRate = total > 0 ? (e.goodQty / total) * 100 : 0;
      const productivity = e.daysWorked > 0 ? e.goodQty / e.daysWorked : 0;
      const prodNorm    = Math.min((productivity / 120) * 100, 100);
      const score       = qualityRate * 0.7 + prodNorm * 0.3;
      const efficiency  = e.daysWorked > 0
        ? (e.workSeconds / (e.daysWorked * 28800)) * 100
        : 0;

      return {
        ...e,
        total,
        qualityRate:  Math.round(qualityRate  * 10) / 10,
        productivity: Math.round(productivity * 10) / 10,
        efficiency:   Math.round(efficiency   * 10) / 10,
        score:        Math.round(score        * 10) / 10,
      };
    });

    employees.sort((a, b) => b.score - a.score);

    return res.json({
      ok:           true,
      weekStart:    start,
      weekEnd:      end,
      weekOffset,
      totalRecords: records.length,
      employees,
      topEmployee:  employees[0] || null,
    });
  } catch (err) {
    console.error("[employeePerf] ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;