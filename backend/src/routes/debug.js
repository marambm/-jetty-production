import { Router } from "express";
import mongoose from "mongoose";
import { isDbConnected } from "../config/db.js";

const router = Router();

router.get("/debug/db-status", async (req, res) => {
  const connected = isDbConnected();
  const result = {
    connected,
    readyState: mongoose.connection.readyState,
    databaseName: null,
    collectionsCount: 0,
    collections: [],
    host: null,
  };

  if (connected) {
    try {
      result.databaseName = mongoose.connection.db.databaseName;
      result.host = mongoose.connection.host;
      const cols = await mongoose.connection.db.listCollections().toArray();
      result.collections = cols.map((c) => c.name);
      result.collectionsCount = cols.length;
    } catch (err) {
      result.error = err.message;
    }
  }

  res.json(result);
});

export default router;
