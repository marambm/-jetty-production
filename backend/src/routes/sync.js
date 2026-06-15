import { Router } from "express";
import mongoose from "mongoose";
import { isOracleConnected } from "../config/oracle.js";
import { isDbConnected } from "../config/db.js";
import { syncOracleToMongo, getLastSyncResult } from "../services/oracleSync.js";
import ProductionDaily from "../models/ProductionDaily.js";

const router = Router();

router.post("/sync", async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: "Missing query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD",
    });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return res.status(400).json({
      ok: false,
      error: "Dates must be in YYYY-MM-DD format.",
    });
  }

  try {
    const result = await syncOracleToMongo(from, to);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/debug/sync-status", async (req, res) => {
  const oracleConnected = isOracleConnected();
  const mongoConnected = isDbConnected();

  let mongoDocumentsCount = 0;
  let sampleMongoDocument = null;

  if (mongoConnected) {
    try {
      mongoDocumentsCount = await ProductionDaily.countDocuments();
      sampleMongoDocument = await ProductionDaily.findOne().lean();
    } catch {
    }
  }

  const lastSync = getLastSyncResult();

  res.json({
    oracleConnected,
    mongoConnected,
    oracleRowsFetched: lastSync?.oracleRowsFetched ?? null,
    mongoDocumentsCount,
    lastSyncTime: lastSync?.lastSyncTime ?? null,
    sampleMongoDocument,
    lastSyncError: lastSync?.error ?? null,
  });
});

export default router;
