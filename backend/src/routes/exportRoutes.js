import { Router }         from "express";
import ExcelJS            from "exceljs";
import PDFDocument        from "pdfkit";
import { createCanvas }   from "canvas";
import ProductionDaily    from "../models/ProductionDaily.js";
import Alert              from "../models/Alert.js";
import AuditLog           from "../models/AuditLog.js";
import { requireAuth }    from "../middlewares/auth.js";
import { isDbConnected }  from "../config/db.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers généraux
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

function kpiColor(value, good = 85, warn = 70) {
  if (value == null) return null;
  if (value >= good) return "FF16A34A";
  if (value >= warn) return "FFF97316";
  return "FFDC2626";
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function singleDateFilter(date) {
  if (!date) return {};
  const d = toDate(date);
  if (!d) return { date };
  const dayStart = new Date(d); dayStart.setHours(0,  0,  0,   0);
  const dayEnd   = new Date(d); dayEnd.setHours(23, 59, 59, 999);
  return {
    $or: [
      { date: { $gte: dayStart, $lte: dayEnd } },
      { date },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORMULES OEE — IDENTIQUES À kpi.js
// ─────────────────────────────────────────────────────────────────────────────

function computeAvailability(workSeconds, theoreticalSeconds) {
  if (theoreticalSeconds > 0 && workSeconds > 0)
    return parseFloat(Math.min((workSeconds / theoreticalSeconds) * 100, 100).toFixed(2));
  return null;
}

function computePerformance(totalProduced, workSeconds, idealThroughput) {
  if (workSeconds > 0 && idealThroughput > 0)
    return parseFloat(Math.min((totalProduced / (workSeconds * idealThroughput)) * 100, 100).toFixed(2));
  return null;
}

function computeQuality(goodQty, productionTotal) {
  if (productionTotal > 0)
    return parseFloat(((goodQty / productionTotal) * 100).toFixed(2));
  return null;
}

function computeOee(availability, performance, quality) {
  if (availability != null && performance != null && quality != null)
    return parseFloat(((availability / 100) * (performance / 100) * (quality / 100) * 100).toFixed(2));
  return null;
}

function computeIdealThroughput(dailyData) {
  const rates = dailyData
    .filter(d => d.workSeconds > 0)
    .map(d => {
      const total = (d.goodQty || 0) + (d.defectsQty || 0) + (d.scrapQty || 0);
      return total / d.workSeconds;
    })
    .sort((a, b) => a - b);

  if (rates.length === 0) return null;
  if (rates.length === 1) return rates[0];
  const idx = Math.min(Math.floor(rates.length * 0.95), rates.length - 1);
  return rates[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Data gatherers
// ─────────────────────────────────────────────────────────────────────────────

async function gatherKpiData(from, to, workUnit) {
  const match = { date: { $gte: from, $lte: to } };
  if (workUnit) match.workUnit = workUnit;

  const dailyRaw = await ProductionDaily.aggregate([
    { $match: match },
    {
      $group: {
        _id:                "$date",
        goodQty:            { $sum: "$goodQty" },
        defectsQty:         { $sum: "$defectsQty" },
        scrapQty:           { $sum: "$scrapQty" },
        workSeconds:        { $sum: "$workSeconds" },
        theoreticalSeconds: { $sum: "$theoreticalSeconds" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const idealThroughput = computeIdealThroughput(dailyRaw);

  const series = dailyRaw.map((d) => {
    const total        = d.goodQty + d.defectsQty + d.scrapQty;
    const availability = computeAvailability(d.workSeconds, d.theoreticalSeconds);
    const performance  = computePerformance(total, d.workSeconds, idealThroughput);
    const quality      = computeQuality(d.goodQty, total);
    const oee          = computeOee(availability, performance, quality);

    const rawId = d._id;
    let dateLabel = rawId;
    if (rawId instanceof Date) {
      dateLabel = rawId.toISOString().slice(0, 10);
    } else if (typeof rawId === "string" && rawId.length > 10) {
      dateLabel = rawId.slice(0, 10);
    }

    return {
      date:            dateLabel,
      productionTotal: total,
      losses:          d.defectsQty + d.scrapQty,
      quality:         quality ?? 100,
      performance,
      availability,
      oee,
    };
  });

  const totGood   = dailyRaw.reduce((a, d) => a + d.goodQty,                             0);
  const totProd   = dailyRaw.reduce((a, d) => a + d.goodQty + d.defectsQty + d.scrapQty, 0);
  const totWork   = dailyRaw.reduce((a, d) => a + (d.workSeconds        || 0),            0);
  const totTheo   = dailyRaw.reduce((a, d) => a + (d.theoreticalSeconds || 0),            0);
  const totLosses = dailyRaw.reduce((a, d) => a + d.defectsQty + d.scrapQty,             0);

  const avgQuality      = computeQuality(totGood, totProd) ?? 100;
  const avgAvailability = computeAvailability(totWork, totTheo);
  const avgPerformance  = computePerformance(totProd, totWork, idealThroughput);
  const avgOee          = computeOee(avgAvailability, avgPerformance, avgQuality);

  const byWUMatch = { date: { $gte: from, $lte: to } };
  if (workUnit) byWUMatch.workUnit = workUnit;

  const byWURaw = await ProductionDaily.aggregate([
    { $match: byWUMatch },
    {
      $group: {
        _id:                "$workUnit",
        goodQty:            { $sum: "$goodQty" },
        defectsQty:         { $sum: "$defectsQty" },
        scrapQty:           { $sum: "$scrapQty" },
        workSeconds:        { $sum: "$workSeconds" },
        theoreticalSeconds: { $sum: "$theoreticalSeconds" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byWorkUnit = byWURaw.map((wu) => {
    const total = wu.goodQty + wu.defectsQty + wu.scrapQty;
    const avail = computeAvailability(wu.workSeconds, wu.theoreticalSeconds);
    const perf  = computePerformance(total, wu.workSeconds, idealThroughput);
    const qual  = computeQuality(wu.goodQty, total);
    return {
      workUnit:        wu._id,
      avgOee:          computeOee(avail, perf, qual),
      avgQuality:      qual,
      avgPerformance:  perf,
      avgAvailability: avail,
      productionTotal: total,
      losses:          wu.defectsQty + wu.scrapQty,
    };
  });

  return {
    series,
    byWorkUnit,
    summary: {
      avgOee,
      avgAvailability,
      avgPerformance,
      avgQuality,
      totalProduction: totProd,
      totalLosses:     totLosses,
      daysCount:       series.length,
    },
  };
}

async function gatherDashboardData(date, workUnit) {
  const dateFilter = singleDateFilter(date);
  const prodFilter = { ...dateFilter };
  if (workUnit) prodFilter.workUnit = workUnit;

  const [production, alerts] = await Promise.all([
    ProductionDaily.find(prodFilter).sort({ workUnit: 1 }).lean(),
    Alert.find(dateFilter).sort({ level: 1, workUnit: 1 }).lean(),
  ]);

  const totals = production.reduce(
    (acc, r) => {
      acc.goodQty         += r.goodQty    || 0;
      acc.defectsQty      += r.defectsQty || 0;
      acc.scrapQty        += r.scrapQty   || 0;
      acc.productionTotal += (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0);
      return acc;
    },
    { goodQty: 0, defectsQty: 0, scrapQty: 0, productionTotal: 0 }
  );

  return { production, alerts, totals };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Chart helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildLineChartBuffer({ labels, datasets, title = "", width = 495, height = 200 }) {
  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext("2d");

  const PAD = { top: 44, right: 24, bottom: 44, left: 52 };
  const W   = width  - PAD.left - PAD.right;
  const H   = height - PAD.top  - PAD.bottom;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  if (title) {
    ctx.fillStyle = "#1E293B";
    ctx.font      = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, width / 2, 20);
  }

  const allValues = datasets.flatMap((d) => d.data.filter((v) => v != null));
  if (allValues.length === 0) return canvas.toBuffer("image/png");
  const minVal = Math.max(0, Math.floor(Math.min(...allValues) / 10) * 10 - 5);
  const maxVal = Math.min(100, Math.ceil(Math.max(...allValues) / 10) * 10 + 5);
  const range  = maxVal - minVal || 1;

  const toX = (i) => PAD.left + (i / Math.max(labels.length - 1, 1)) * W;
  const toY = (v) => PAD.top  + H - ((v - minVal) / range) * H;

  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth   = 1;
  for (let t = 0; t <= 5; t++) {
    const val = minVal + (range * t) / 5;
    const y   = toY(val);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + W, y); ctx.stroke();
    ctx.fillStyle = "#64748B"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(val.toFixed(0), PAD.left - 6, y + 4);
  }

  ctx.fillStyle = "#64748B"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
  const step = Math.ceil(labels.length / 10);
  labels.forEach((lbl, i) => {
    if (i % step !== 0) return;
    ctx.fillText(String(lbl).slice(-5), toX(i), PAD.top + H + 14);
  });

  for (const ds of datasets) {
    ctx.strokeStyle = ds.color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    let first = true;
    ds.data.forEach((v, i) => {
      if (v == null) { first = true; return; }
      if (first) { ctx.moveTo(toX(i), toY(v)); first = false; }
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.stroke();
    ctx.fillStyle = ds.color;
    ds.data.forEach((v, i) => {
      if (v == null) return;
      ctx.beginPath(); ctx.arc(toX(i), toY(v), 3, 0, Math.PI * 2); ctx.fill();
    });
  }

  let lx = PAD.left;
  for (const ds of datasets) {
    ctx.fillStyle = ds.color;
    ctx.fillRect(lx, height - 14, 14, 9);
    ctx.fillStyle = "#334155"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(ds.label, lx + 18, height - 6);
    lx += ctx.measureText(ds.label).width + 40;
  }

  return canvas.toBuffer("image/png");
}

function buildBarChartBuffer({ labels, datasets, title = "", width = 495, height = 200 }) {
  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext("2d");

  const PAD = { top: 44, right: 24, bottom: 50, left: 58 };
  const W   = width  - PAD.left - PAD.right;
  const H   = height - PAD.top  - PAD.bottom;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  if (title) {
    ctx.fillStyle = "#1E293B";
    ctx.font      = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, width / 2, 20);
  }

  const allValues = datasets.flatMap((d) => d.data);
  const maxVal    = Math.ceil(Math.max(...allValues, 1) / 10) * 10;
  const toY       = (v) => PAD.top + H - (v / maxVal) * H;

  ctx.strokeStyle = "#E2E8F0"; ctx.lineWidth = 1;
  for (let t = 0; t <= 5; t++) {
    const v = (maxVal * t) / 5;
    const y = toY(v);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + W, y); ctx.stroke();
    ctx.fillStyle = "#64748B"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(fmt(Math.round(v)), PAD.left - 5, y + 4);
  }

  const groupW  = W / Math.max(labels.length, 1);
  const dsCount = datasets.length;
  const barW    = Math.min((groupW / dsCount) * 0.75, 28);

  datasets.forEach((ds, di) => {
    ctx.fillStyle = ds.color;
    ds.data.forEach((v, i) => {
      const gx   = PAD.left + i * groupW + groupW / 2;
      const barX = gx + (di - (dsCount - 1) / 2) * (barW + 3) - barW / 2;
      const barH = PAD.top + H - toY(v);
      if (barH > 0) ctx.fillRect(barX, toY(v), barW, barH);
    });
  });

  ctx.fillStyle = "#64748B"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
  labels.forEach((lbl, i) => {
    ctx.fillText(String(lbl).slice(-5), PAD.left + i * groupW + groupW / 2, PAD.top + H + 14);
  });

  let lx = PAD.left;
  for (const ds of datasets) {
    ctx.fillStyle = ds.color; ctx.fillRect(lx, height - 16, 14, 10);
    ctx.fillStyle = "#334155"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(ds.label, lx + 18, height - 7);
    lx += ctx.measureText(ds.label).width + 40;
  }

  return canvas.toBuffer("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Excel helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyHeaderStyle(row, bgArgb = "FF334155") {
  row.eachCell((cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border    = { bottom: { style: "medium", color: { argb: "FFCBD5E1" } } };
  });
}

function applySummaryStyle(row) {
  row.eachCell((cell) => {
    cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.font  = { bold: true, color: { argb: "FF1E3A5F" }, size: 11 };
    cell.border = {
      top:    { style: "medium", color: { argb: "FF93C5FD" } },
      bottom: { style: "medium", color: { argb: "FF93C5FD" } },
    };
  });
}

function applyZebra(row, idx) {
  if (idx % 2 !== 0) return;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  });
}

function colorKpiCell(cell, value, good = 85, warn = 70) {
  const argb = kpiColor(value, good, warn);
  if (!argb) return;
  cell.font = { bold: true, color: { argb } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF helpers
// ─────────────────────────────────────────────────────────────────────────────

function drawImage(doc, buf, x, yPos, imgWidth, imgHeight) {
  doc.image(buf, x, yPos, { width: imgWidth, height: imgHeight });
  doc.y = yPos + imgHeight + 14;
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT EXCEL
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/excel", requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

    const { date, from, to, workUnit, includeAudit } = req.query;
    const workbook               = new ExcelJS.Workbook();
    workbook.creator             = "JETTY";
    workbook.created             = new Date();
    workbook.properties.date1904 = false;

    // ── Mode KPIs (plage de dates) ─────────────────────────────────────────
    if (from && to) {
      const { series, summary, byWorkUnit } = await gatherKpiData(from, to, workUnit);

      // ── Feuille 1 : Summary ──────────────────────────────────────────────
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.mergeCells("A1:B1");
      summarySheet.getCell("A1").value     = "JETTY — KPI Summary";
      summarySheet.getCell("A1").font      = { bold: true, size: 16, color: { argb: "FF1E293B" } };
      summarySheet.getCell("A1").alignment = { horizontal: "center" };

      summarySheet.mergeCells("A2:B2");
      summarySheet.getCell("A2").value     = `Period: ${from}  →  ${to}${workUnit ? "   |   Work Unit: " + workUnit : ""}`;
      summarySheet.getCell("A2").font      = { italic: true, color: { argb: "FF64748B" } };
      summarySheet.getCell("A2").alignment = { horizontal: "center" };

      summarySheet.addRow([]);

      const kpis = [
        ["OEE",              summary.avgOee          ?? "—", "%",    85, 70],
        ["Availability",     summary.avgAvailability ?? "—", "%",    95, 85],
        ["Performance",      summary.avgPerformance  ?? "—", "%",    85, 70],
        ["Quality",          summary.avgQuality      ?? "—", "%",    95, 85],
        ["Total Production", summary.totalProduction,        "units", null, null],
        ["Total Losses",     summary.totalLosses,            "units", null, null],
        ["Days Analysed",    summary.daysCount,              "days",  null, null],
      ];

      summarySheet.columns = [{ width: 22 }, { width: 16 }, { width: 8 }];
      const headerRow = summarySheet.addRow(["Indicator", "Value", "Unit"]);
      applyHeaderStyle(headerRow, "FF1E293B");

      kpis.forEach(([label, value, unit, good, warn], i) => {
        const row = summarySheet.addRow([label, value, unit]);
        applyZebra(row, i);
        if (good != null && typeof value === "number") colorKpiCell(row.getCell(2), value, good, warn);
        row.getCell(2).alignment = { horizontal: "right" };
      });

      // ── Feuille 2 : Daily KPIs ───────────────────────────────────────────
      const sheet = workbook.addWorksheet("Daily KPIs");
      sheet.columns = [
        { header: "Date",             key: "date",            width: 14 },
        { header: "OEE (%)",          key: "oee",             width: 12 },
        { header: "Availability (%)", key: "availability",    width: 16 },
        { header: "Performance (%)",  key: "performance",     width: 16 },
        { header: "Quality (%)",      key: "quality",         width: 14 },
        { header: "Total Production", key: "productionTotal", width: 18 },
        { header: "Total Losses",     key: "losses",          width: 14 },
      ];
      applyHeaderStyle(sheet.getRow(1));
      sheet.getRow(1).height = 24;

      series.forEach((s, i) => {
        const row = sheet.addRow({
          date:            s.date,
          oee:             s.oee           ?? "—",
          availability:    s.availability  ?? "—",
          performance:     s.performance   ?? "—",
          quality:         s.quality,
          productionTotal: s.productionTotal,
          losses:          s.losses,
        });
        applyZebra(row, i);
        if (typeof s.oee          === "number") colorKpiCell(row.getCell("oee"),          s.oee,          85, 70);
        if (typeof s.availability === "number") colorKpiCell(row.getCell("availability"), s.availability, 95, 85);
        if (typeof s.performance  === "number") colorKpiCell(row.getCell("performance"),  s.performance,  85, 70);
        if (typeof s.quality      === "number") colorKpiCell(row.getCell("quality"),      s.quality,      95, 85);
        if (s.productionTotal > 0 && s.losses / s.productionTotal > 0.05)
          row.getCell("losses").font = { color: { argb: "FFDC2626" }, bold: true };
      });

      sheet.addRow([]);
      const summaryRow = sheet.addRow({
        date:            "AVERAGE / TOTAL",
        oee:             summary.avgOee          ?? "—",
        availability:    summary.avgAvailability ?? "—",
        performance:     summary.avgPerformance  ?? "—",
        quality:         summary.avgQuality,
        productionTotal: summary.totalProduction,
        losses:          summary.totalLosses,
      });
      applySummaryStyle(summaryRow);
      summaryRow.height = 20;

      // ── Feuille 3 : OEE par unité de travail ─────────────────────────────
      if (byWorkUnit.length > 0) {
        const wuSheet = workbook.addWorksheet("OEE by Work Unit");
        wuSheet.columns = [
          { header: "Work Unit",        key: "workUnit",        width: 22 },
          { header: "OEE (%)",          key: "avgOee",          width: 12 },
          { header: "Availability (%)", key: "avgAvailability", width: 16 },
          { header: "Performance (%)",  key: "avgPerformance",  width: 16 },
          { header: "Quality (%)",      key: "avgQuality",      width: 14 },
          { header: "Total Production", key: "productionTotal", width: 18 },
          { header: "Total Losses",     key: "losses",          width: 14 },
        ];
        applyHeaderStyle(wuSheet.getRow(1), "FF4F46E5");
        wuSheet.getRow(1).height = 24;

        byWorkUnit.forEach((wu, i) => {
          const row = wuSheet.addRow({
            workUnit:        wu.workUnit,
            avgOee:          wu.avgOee          ?? "—",
            avgAvailability: wu.avgAvailability ?? "—",
            avgPerformance:  wu.avgPerformance  ?? "—",
            avgQuality:      wu.avgQuality      ?? "—",
            productionTotal: wu.productionTotal,
            losses:          wu.losses,
          });
          applyZebra(row, i);
          if (typeof wu.avgOee          === "number") colorKpiCell(row.getCell("avgOee"),          wu.avgOee,          85, 70);
          if (typeof wu.avgAvailability === "number") colorKpiCell(row.getCell("avgAvailability"), wu.avgAvailability, 95, 85);
          if (typeof wu.avgPerformance  === "number") colorKpiCell(row.getCell("avgPerformance"),  wu.avgPerformance,  85, 70);
          if (typeof wu.avgQuality      === "number") colorKpiCell(row.getCell("avgQuality"),      wu.avgQuality,      95, 85);
        });
      }

      // ── Feuille 4 : Audit Trail (optionnelle) ────────────────────────────
      if (includeAudit === "true") {
        const fromDate  = toDate(from);
        const toDateEnd = toDate(to);
        if (toDateEnd) toDateEnd.setHours(23, 59, 59, 999);
        const auditLogs = await AuditLog.find({
          collection: "ProductionDaily",
          timestamp:  { $gte: fromDate, $lte: toDateEnd },
        }).sort({ timestamp: -1 }).limit(500).lean();
        if (auditLogs.length > 0) {
          const aSheet = workbook.addWorksheet("Audit Trail");
          aSheet.columns = [
            { header: "Timestamp",   key: "timestamp",  width: 22 },
            { header: "Action",      key: "action",     width: 10 },
            { header: "User",        key: "userName",   width: 24 },
            { header: "Collection",  key: "collection", width: 18 },
            { header: "Document ID", key: "documentId", width: 26 },
            { header: "Changes",     key: "changes",    width: 60 },
          ];
          applyHeaderStyle(aSheet.getRow(1), "FF0369A1");
          auditLogs.forEach((log, i) => {
            const changesStr = log.changes.map((c) => `${c.field}: ${c.oldValue} → ${c.newValue}`).join(" | ") || "—";
            const row = aSheet.addRow({
              timestamp:  log.timestamp?.toISOString().slice(0, 19).replace("T", " "),
              action:     log.action,
              userName:   log.userName,
              collection: log.collection,
              documentId: String(log.documentId),
              changes:    changesStr,
            });
            applyZebra(row, i);
            const actionCell = row.getCell("action");
            if      (log.action === "DELETE") actionCell.font = { color: { argb: "FFDC2626" }, bold: true };
            else if (log.action === "CREATE") actionCell.font = { color: { argb: "FF16A34A" }, bold: true };
            else                              actionCell.font = { color: { argb: "FFF97316" }, bold: true };
            row.getCell("changes").alignment = { wrapText: true };
          });
        }
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=JETTY_KPIs_${from}_${to}.xlsx`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ── Mode Dashboard (date unique) ───────────────────────────────────────
    const { production, alerts, totals } = await gatherDashboardData(date, workUnit);

    const prodSheet = workbook.addWorksheet("Production");
    prodSheet.columns = [
      { header: "Date",      key: "date",       width: 14 },
      { header: "Work Unit", key: "workUnit",   width: 22 },
      { header: "Good Qty",  key: "goodQty",    width: 14 },
      { header: "Defects",   key: "defectsQty", width: 14 },
      { header: "Scrap",     key: "scrapQty",   width: 14 },
      { header: "Total",     key: "total",      width: 14 },
      { header: "Quality %", key: "quality",    width: 12 },
    ];
    applyHeaderStyle(prodSheet.getRow(1));
    prodSheet.getRow(1).height = 24;

    production.forEach((r, i) => {
      const total   = (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0);
      const quality = total > 0 ? Number(((r.goodQty / total) * 100).toFixed(1)) : 100;
      const row     = prodSheet.addRow({ date: r.date, workUnit: r.workUnit, goodQty: r.goodQty, defectsQty: r.defectsQty, scrapQty: r.scrapQty, total, quality });
      applyZebra(row, i);
      colorKpiCell(row.getCell("quality"), quality, 95, 85);
      if (r.defectsQty > 0) row.getCell("defectsQty").font = { color: { argb: "FFF97316" } };
      if (r.scrapQty   > 0) row.getCell("scrapQty").font   = { color: { argb: "FFDC2626" } };
    });

    prodSheet.addRow([]);
    const totRow = prodSheet.addRow({
      date: "", workUnit: "TOTAL",
      goodQty: totals.goodQty, defectsQty: totals.defectsQty,
      scrapQty: totals.scrapQty, total: totals.productionTotal,
      quality: totals.productionTotal > 0 ? Number(((totals.goodQty / totals.productionTotal) * 100).toFixed(1)) : 100,
    });
    applySummaryStyle(totRow);

    if (alerts.length > 0) {
      const alertSheet = workbook.addWorksheet("Alerts");
      alertSheet.columns = [
        { header: "Date",      key: "date",     width: 14 },
        { header: "Work Unit", key: "workUnit", width: 20 },
        { header: "Level",     key: "level",    width: 10 },
        { header: "Message",   key: "message",  width: 60 },
      ];
      applyHeaderStyle(alertSheet.getRow(1), "FFB91C1C");
      alerts.forEach((a, i) => {
        const row = alertSheet.addRow({ date: a.date, workUnit: a.workUnit, level: a.level, message: a.message });
        applyZebra(row, i);
        const levelArgb = a.level === "red" ? "FFDC2626" : "FFF97316";
        row.getCell("level").font = { color: { argb: levelArgb }, bold: true };
        row.getCell("level").fill = { type: "pattern", pattern: "solid", fgColor: { argb: a.level === "red" ? "FFFEE2E2" : "FFFFEDD5" } };
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=JETTY_Production_${date}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ ok: false, error: "Excel export failed: " + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT PDF
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/pdf", requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return res.status(503).json({ ok: false, error: "Database not connected." });

    const { date, from, to, workUnit, includeAudit } = req.query;

    const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    const drawHeader = (title, subtitle) => {
      doc.rect(0, 0, doc.page.width, 72).fill("#1E3A5F");
      doc.fontSize(20).fillColor("#FFFFFF")
         .text(title, 50, 18, { align: "center", width: doc.page.width - 100 });
      doc.fontSize(10).fillColor("#93C5FD")
         .text(subtitle, 50, 46, { align: "center", width: doc.page.width - 100 });
      doc.y = 90;
    };

    const drawSectionTitle = (text) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.6);
      const barY = doc.y;
      doc.rect(50, barY, 495, 22).fill("#334155");
      doc.fontSize(10).fillColor("#FFFFFF")
         .text(text, 58, barY + 5, { width: 480 });
      doc.y = barY + 28;
    };

    const drawFooter = () => {
      const y = doc.page.height - 28;
      doc.fontSize(7).fillColor("#94A3B8")
         .text(
           `Generated by JETTY  •  ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
           50, y, { align: "center", width: 495 }
         );
    };

    // ── Mode KPIs (plage de dates) ─────────────────────────────────────────
    if (from && to) {
      res.setHeader("Content-Disposition", `attachment; filename=JETTY_KPIs_${from}_${to}.pdf`);

      const { series, summary, byWorkUnit } = await gatherKpiData(from, to, workUnit);

      drawHeader(
        "JETTY — Performance Indicators",
        `Period: ${from}  →  ${to}${workUnit ? "  |  Work Unit: " + workUnit : ""}`
      );

      drawSectionTitle("Summary");

      const kpiCards = [
        { label: "OEE",          value: summary.avgOee,          unit: "%", good: 85, warn: 70 },
        { label: "Availability", value: summary.avgAvailability, unit: "%", good: 95, warn: 85 },
        { label: "Performance",  value: summary.avgPerformance,  unit: "%", good: 85, warn: 70 },
        { label: "Quality",      value: summary.avgQuality,      unit: "%", good: 95, warn: 85 },
      ];

      const cardW = 113, cardH = 52, cardGap = 9, cardY = doc.y;

      kpiCards.forEach((kpi, i) => {
        const cardX = 50 + i * (cardW + cardGap);
        const color = kpi.value != null
          ? kpi.value >= kpi.good ? "#16A34A"
          : kpi.value >= kpi.warn ? "#F97316" : "#DC2626"
          : "#64748B";
        doc.rect(cardX, cardY, cardW, cardH).fill("#F1F5F9").stroke("#CBD5E1");
        doc.fontSize(8).fillColor("#64748B")
           .text(kpi.label, cardX + 4, cardY + 7, { width: cardW - 8, align: "center" });
        doc.fontSize(17).fillColor(color)
           .text(kpi.value != null ? `${kpi.value}${kpi.unit}` : "—",
             cardX + 4, cardY + 20, { width: cardW - 8, align: "center" });
      });

      doc.y = cardY + cardH + 14;
      doc.fontSize(10).fillColor("#334155");
      doc.text(`Total Production : ${fmt(summary.totalProduction)} units`);
      doc.text(`Total Losses     : ${fmt(summary.totalLosses)} units${
        summary.totalProduction > 0
          ? `  (${((summary.totalLosses / summary.totalProduction) * 100).toFixed(1)} %)`
          : ""
      }`);
      doc.text(`Days analysed    : ${summary.daysCount}`);
      doc.moveDown(0.8);

      // ── Graphiques ────────────────────────────────────────────────────────
      if (series.length > 1) {
        drawSectionTitle("KPI Trends");
        const labels = series.map((s) => s.date);
        const chartW = 495, chartH = 200;

        if (doc.y + chartH > 760) doc.addPage();
        const kpiChartBuf = buildLineChartBuffer({
          labels,
          title: "OEE / Performance / Quality (%)",
          datasets: [
            { label: "OEE",         data: series.map((s) => s.oee),         color: "#2563EB" },
            { label: "Performance", data: series.map((s) => s.performance), color: "#F97316" },
            { label: "Quality",     data: series.map((s) => s.quality),     color: "#16A34A" },
          ],
          width: chartW, height: chartH,
        });
        drawImage(doc, kpiChartBuf, 50, doc.y, chartW, chartH);

        if (doc.y + chartH > 760) doc.addPage();
        const barChartBuf = buildBarChartBuffer({
          labels,
          title: "Daily Production vs Losses",
          datasets: [
            { label: "Production", data: series.map((s) => s.productionTotal), color: "#2563EB" },
            { label: "Losses",     data: series.map((s) => s.losses),          color: "#DC2626" },
          ],
          width: chartW, height: chartH,
        });
        drawImage(doc, barChartBuf, 50, doc.y, chartW, chartH);
      }

      if (byWorkUnit.length > 1) {
        if (doc.y + 200 > 760) doc.addPage();
        const wuChartBuf = buildBarChartBuffer({
          labels:   byWorkUnit.map((wu) => wu.workUnit),
          title:    "Average OEE by Work Unit (%)",
          datasets: [{ label: "OEE", data: byWorkUnit.map((wu) => wu.avgOee ?? 0), color: "#4F46E5" }],
          width: 495, height: 200,
        });
        drawImage(doc, wuChartBuf, 50, doc.y, 495, 200);
      }

      // ── Tableau journalier ────────────────────────────────────────────────
      if (series.length > 0) {
        if (doc.y > 620) doc.addPage();
        drawSectionTitle("Daily Detail");

        const colWidths = [80, 55, 60, 60, 58, 72, 60];
        const headers   = ["Date", "OEE %", "Avail. %", "Perf. %", "Qual. %", "Production", "Losses"];
        const tableTop  = doc.y;
        let x = 50;

        doc.rect(50, tableTop, 495, 18).fill("#334155");
        doc.fontSize(9).fillColor("#FFFFFF");
        headers.forEach((h, i) => {
          doc.text(h, x + 3, tableTop + 3, { width: colWidths[i] - 6 });
          x += colWidths[i];
        });

        let y = tableTop + 20;
        doc.fillColor("#334155").fontSize(9);

        for (let i = 0; i < series.length; i++) {
          const s = series[i];
          if (y > 740) { doc.addPage(); y = 50; }
          if (i % 2 === 0) { doc.rect(50, y - 2, 495, 16).fill("#F8FAFC"); doc.fillColor("#334155"); }
          x = 50;
          const vals = [s.date, s.oee ?? "—", s.availability ?? "—", s.performance ?? "—", s.quality, fmt(s.productionTotal), fmt(s.losses)];
          const thresholds = [null, [85, 70], [95, 85], [85, 70], [95, 85], null, null];
          vals.forEach((v, ci) => {
            const thr = thresholds[ci];
            if (thr && typeof v === "number") {
              const color = v >= thr[0] ? "#16A34A" : v >= thr[1] ? "#F97316" : "#DC2626";
              doc.fillColor(color).text(String(v), x + 3, y, { width: colWidths[ci] - 6 });
            } else {
              doc.fillColor("#334155").text(String(v), x + 3, y, { width: colWidths[ci] - 6 });
            }
            x += colWidths[ci];
          });
          y += 16;
        }
        doc.y = y + 10;
      }

      // ── Tableau OEE par unité de travail ──────────────────────────────────
      if (byWorkUnit.length > 0) {
        if (doc.y > 600) doc.addPage();
        drawSectionTitle("OEE by Work Unit");

        const colWidths = [110, 52, 60, 58, 56, 80, 60];
        const headers   = ["Work Unit", "OEE %", "Avail. %", "Perf. %", "Qual. %", "Production", "Losses"];
        const tableTop  = doc.y;
        let x = 50;

        doc.rect(50, tableTop, 476, 18).fill("#4F46E5");
        doc.fontSize(9).fillColor("#FFFFFF");
        headers.forEach((h, i) => {
          doc.text(h, x + 3, tableTop + 3, { width: colWidths[i] - 6 });
          x += colWidths[i];
        });

        let y = tableTop + 20;
        doc.fillColor("#334155").fontSize(9);

        for (let i = 0; i < byWorkUnit.length; i++) {
          const wu = byWorkUnit[i];
          if (y > 740) { doc.addPage(); y = 50; }
          if (i % 2 === 0) { doc.rect(50, y - 2, 476, 16).fill("#F8FAFC"); doc.fillColor("#334155"); }
          x = 50;
          const vals = [wu.workUnit, wu.avgOee ?? "—", wu.avgAvailability ?? "—", wu.avgPerformance ?? "—", wu.avgQuality ?? "—", fmt(wu.productionTotal), fmt(wu.losses)];
          const thresholds = [null, [85, 70], [95, 85], [85, 70], [95, 85], null, null];
          vals.forEach((v, ci) => {
            const thr = thresholds[ci];
            if (thr && typeof v === "number") {
              const color = v >= thr[0] ? "#16A34A" : v >= thr[1] ? "#F97316" : "#DC2626";
              doc.fillColor(color).text(String(v), x + 3, y, { width: colWidths[ci] - 6 });
            } else {
              doc.fillColor("#334155").text(String(v), x + 3, y, { width: colWidths[ci] - 6 });
            }
            x += colWidths[ci];
          });
          y += 16;
        }
        doc.y = y + 10;
      }

      // ── Audit Trail ───────────────────────────────────────────────────────
      if (includeAudit === "true") {
        const fromDate  = toDate(from);
        const toDateEnd = toDate(to);
        if (toDateEnd) toDateEnd.setHours(23, 59, 59, 999);
        const auditLogs = await AuditLog.find({
          collection: "ProductionDaily",
          timestamp:  { $gte: fromDate, $lte: toDateEnd },
        }).sort({ timestamp: -1 }).limit(200).lean();
        if (auditLogs.length > 0) {
          if (doc.y > 620) doc.addPage();
          drawSectionTitle("Audit Trail");
          doc.fontSize(8).fillColor("#334155");
          for (const log of auditLogs) {
            if (doc.y > 740) doc.addPage();
            const actionColor = log.action === "DELETE" ? "#DC2626" : log.action === "CREATE" ? "#16A34A" : "#F97316";
            doc.fillColor(actionColor).text(`[${log.action}] `, { continued: true })
               .fillColor("#1E293B").text(`${log.userName}  `, { continued: true })
               .fillColor("#64748B").text(log.timestamp?.toISOString().slice(0, 19).replace("T", " "));
            if (log.changes?.length) {
              const chStr = log.changes.map((c) => `${c.field}: ${c.oldValue} → ${c.newValue}`).join("  •  ");
              doc.fillColor("#94A3B8").text(chStr, { indent: 14 });
            }
            doc.moveDown(0.3);
          }
        }
      }

      drawFooter();
      doc.end();
      return;
    }

    // ── Mode Dashboard (date unique) ───────────────────────────────────────
    res.setHeader("Content-Disposition", `attachment; filename=JETTY_Production_${date}.pdf`);

    const { production, alerts, totals } = await gatherDashboardData(date, workUnit);

    drawHeader("JETTY Production Report", `Date: ${date}`);
    drawSectionTitle("Production Summary");

    const quality = totals.productionTotal > 0
      ? ((totals.goodQty / totals.productionTotal) * 100).toFixed(1)
      : "100";

    const summaryLines = [
      ["Total Production", fmt(totals.productionTotal) + " units"],
      ["Good Qty",         fmt(totals.goodQty)],
      ["Defects",          fmt(totals.defectsQty)],
      ["Scrap",            fmt(totals.scrapQty)],
      ["Quality Rate",     quality + " %"],
    ];
    doc.fontSize(11);
    summaryLines.forEach(([label, value]) => {
      doc.fillColor("#64748B").text(`${label}:  `, { continued: true })
         .fillColor("#1E293B").text(value);
    });

    if (production.length >= 1) {
      const chartW = 495, chartH = 200;
      if (doc.y + chartH > 760) doc.addPage();
      doc.moveDown(0.5);
      const barBuf = buildBarChartBuffer({
        labels:   production.map((r) => r.workUnit),
        title:    "Production by Work Unit",
        datasets: [
          { label: "Good",    data: production.map((r) => r.goodQty    || 0), color: "#16A34A" },
          { label: "Defects", data: production.map((r) => r.defectsQty || 0), color: "#F97316" },
          { label: "Scrap",   data: production.map((r) => r.scrapQty   || 0), color: "#DC2626" },
        ],
        width: chartW, height: chartH,
      });
      drawImage(doc, barBuf, 50, doc.y, chartW, chartH);
    }

    if (production.length > 0) {
      if (doc.y > 600) doc.addPage();
      drawSectionTitle("Production by Work Unit");

      const colWidths = [130, 80, 80, 80, 80];
      const headers   = ["Work Unit", "Good", "Defects", "Scrap", "Total"];
      const tableTop  = doc.y;
      let x = 50;

      doc.rect(50, tableTop, 450, 18).fill("#334155");
      doc.fontSize(9).fillColor("#FFFFFF");
      headers.forEach((h, i) => { doc.text(h, x + 4, tableTop + 3, { width: colWidths[i] - 8 }); x += colWidths[i]; });

      let y = tableTop + 20;
      for (let i = 0; i < production.length; i++) {
        const r = production[i];
        if (y > 740) { doc.addPage(); y = 50; }
        if (i % 2 === 0) { doc.rect(50, y - 2, 450, 16).fill("#F8FAFC"); doc.fillColor("#334155"); }
        x = 50;
        const total = (r.goodQty || 0) + (r.defectsQty || 0) + (r.scrapQty || 0);
        [r.workUnit, r.goodQty, r.defectsQty, r.scrapQty, total].forEach((v, ci) => {
          const color = ci === 2 && r.defectsQty > 0 ? "#F97316"
                      : ci === 3 && r.scrapQty   > 0 ? "#DC2626" : "#334155";
          doc.fillColor(color).text(String(v ?? ""), x + 4, y, { width: colWidths[ci] - 8 });
          x += colWidths[ci];
        });
        y += 16;
      }
      doc.y = y;
      doc.moveDown(1);
    }

    if (alerts.length > 0) {
      if (doc.y > 660) doc.addPage();
      drawSectionTitle("Alerts");
      for (const a of alerts) {
        if (doc.y > 740) doc.addPage();
        const color = a.level === "red" ? "#DC2626" : "#F97316";
        doc.fontSize(9).fillColor(color)
           .text(`[${a.level.toUpperCase()}] `, { continued: true })
           .fillColor("#334155")
           .text(`${a.workUnit}  —  ${a.message}`);
        doc.moveDown(0.3);
      }
    }

    drawFooter();
    doc.end();

  } catch (err) {
    console.error("PDF export error:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "PDF export failed: " + err.message });
    } else {
      res.end();
    }
  }
});

export default router;