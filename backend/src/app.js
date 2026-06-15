import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/health.js";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import productionRoutes from "./routes/production.js";
import kpiRoutes from "./routes/kpis.js";
import exportRoutes from "./routes/exportRoutes.js";
import settingsRoutes from "./routes/settings.js";
import debugRoutes from "./routes/debug.js";
import syncRoutes from "./routes/sync.js";
import forecastRoutes from "./routes/forecast.js";
import workUnitRoutes from "./routes/workUnits.js";
import usersRoutes from "./routes/users.js";
import employeePerformanceRouter from "./routes/employeePerformance.js";
import auditRoutes from "./routes/audit.js";

import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";
import auditMiddleware from "./middlewares/audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── DEBUG — affiche chaque requête reçue (retirer en production) ──────────────
app.use((req, _res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Audit middleware — doit être avant toutes les routes ──────────────────────
app.use(auditMiddleware);

// ── Routes spécifiques EN PREMIER (avant les montages génériques /api) ────────
app.use("/api/users",                usersRoutes);
app.use("/api/ai",                   aiRoutes);
app.use("/api/employee-performance", employeePerformanceRouter);
app.use("/api/audit",                auditRoutes);

// ── Routes génériques montées sur /api ────────────────────────────────────────
app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", productionRoutes);
app.use("/api", kpiRoutes);
app.use("/api", exportRoutes);
app.use("/api", settingsRoutes);
app.use("/api", debugRoutes);
app.use("/api", syncRoutes);
app.use("/api", forecastRoutes);
app.use("/api", workUnitRoutes);

// ── Servir le frontend React en production ────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

// ── Gestionnaires d'erreurs (toujours en dernier) ─────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;