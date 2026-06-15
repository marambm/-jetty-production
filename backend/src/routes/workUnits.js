import { Router } from "express";
import ProductionDaily from "../models/ProductionDaily.js";

const router = Router();

router.get("/work-units", async (req, res) => {
  try {
    const units = await ProductionDaily.distinct("workUnit");
    units.sort((a, b) => a.localeCompare(b));
    res.json({ ok: true, workUnits: units });
  } catch (err) {
    console.error("Work units fetch error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
