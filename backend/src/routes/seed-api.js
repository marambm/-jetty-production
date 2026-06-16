import express from "express";
import mongoose from "mongoose";
import ProductionDaily from "../models/ProductionDaily.js";

const router = express.Router();

router.get("/run-seed", async (req, res) => {
  try {
    const count = await ProductionDaily.countDocuments();
    res.json({ ok: true, count, message: "Collection found" });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

export default router;
