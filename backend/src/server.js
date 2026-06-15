import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import cron from "node-cron";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initOraclePool } from "./config/oracle.js";
import { syncOracleToMongo } from "./services/oracleSync.js";
import { computeAndSaveAlerts } from "./routes/kpis.js"; // ✅ import ajouté

const PORT = process.env.BACKEND_PORT || 4000;

let importCount = 0;
let lastImportTime = null;
let lastImportStatus = "pending";

app.get("/api/realtime-status", (req, res) => {
  res.json({
    ok: true,
    message: "Oracle → MongoDB synchronisation temps réel",
    totalImports: importCount,
    lastImportAt: lastImportTime,
    lastImportStatus: lastImportStatus,
    nextImportIn: "toutes les 5 minutes",
    oracleSource: process.env.ORACLE_CONNECT_STRING,
    mongoTarget: process.env.MONGODB_URI,
    serverTime: new Date().toISOString(),
  });
});

// ✅ Fonction helper : génère les alertes des 7 derniers jours
async function refreshAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const count = await computeAndSaveAlerts(d).catch(() => 0);
    total += count;
  }
  console.log(`[Alerts] ✅ Alertes régénérées pour les 7 derniers jours (${total} au total)`);
}

async function start() {
  try {
    // MongoDB
    await connectDB();

    const dbState = mongoose.connection.readyState;
    const stateLabels = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
    console.log(`[MongoDB] Status: ${stateLabels[dbState] || "unknown"} (readyState=${dbState})`);

    if (dbState !== 1) {
      console.log("[MongoDB] Dashboard and alerts will return empty data until MongoDB is available.");
    }

    // Oracle
    await initOraclePool();

    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });

    // ─────────────────────────────
    // Import initial Oracle → MongoDB
    // ─────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Temps Réel] Import initial Oracle → MongoDB...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

   try {
  const today = new Date().toISOString().slice(0, 10);
  const from  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  await syncOracleToMongo(from, today);
  importCount++;
  lastImportTime = new Date().toISOString();
  lastImportStatus = "success";
  console.log(`[Temps Réel] ✅ Import #${importCount} terminé à ${lastImportTime}`);
} catch (err) {
  lastImportStatus = "error: " + err.message;
  console.error("[Temps Réel] ❌ Import initial échoué:", err.message);
}

    // ✅ Génération des alertes au démarrage (après l'import)
    console.log("[Alerts] 🔔 Génération des alertes au démarrage...");
    await refreshAlerts().catch(console.error);

    // ─────────────────────────────
    // CRON (toutes les 5 minutes)
    // ─────────────────────────────
    cron.schedule("*/5 * * * *", async () => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[Temps Réel] 🔄 Synchronisation Oracle → MongoDB");
      console.log(`[Temps Réel] Heure : ${new Date().toLocaleTimeString()}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      try {
       const today = new Date().toISOString().slice(0, 10);
        const from  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        await syncOracleToMongo(from, today);
      } catch (err) {
        lastImportStatus = "error: " + err.message;
        console.error("[Temps Réel] ❌ Erreur import:", err.message);
      }

      // ✅ Régénère les alertes après chaque import
      await refreshAlerts().catch(console.error);
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Temps Réel] ✅ Cron planifié : toutes les 5 minutes");
    console.log("[Temps Réel] Oracle source :", process.env.ORACLE_CONNECT_STRING);
    console.log("[Temps Réel] MongoDB cible :", process.env.MONGODB_URI);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  } catch (err) {
    console.error("❌ Error starting server:", err.message);
    process.exit(1);
  }
}

start();