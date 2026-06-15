import { useState, useEffect, useCallback } from "react";
import {
  BarChart3, Gauge, CheckCircle, Activity, Shield, Loader2,
  FileSpreadsheet, FileText, X, Calendar,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { useI18n } from "../i18n/I18nProvider";
import { fetchKpis, fetchWorkUnits, downloadExport } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import CalendarPicker from "../components/CalendarPicker";
import WorkUnitCombobox from "../components/WorkUnitCombobox";
import FilterField from "../components/FilterField";
import { ui } from "../components/uiStyles";

// ── Couleurs par unité ────────────────────────────────────────────────────────
const WU_COLORS = ["#4f46e5","#10b981","#f59e0b","#0891b2","#ec4899","#8b5cf6","#ef4444"];
const OEE_OBJECTIVE = 85;

function KpiSummaryCard({ title, value, unit, icon: Icon, color }) {
  const colorMap = {
    green:  "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    blue:   "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    orange: "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
    red:    "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  };
  const iconBg = {
    green:  "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400",
    blue:   "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400",
    indigo: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400",
    orange: "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400",
    red:    "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colorMap[color] || colorMap.blue}`} data-testid={`card-kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium opacity-80">{title}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg[color] || iconBg.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight">
        {value != null ? value : "--"}{unit && <span className="text-lg font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}

// ── Tooltip graphique tendance ────────────────────────────────────────────────
function TrendTooltip({ active, payload, label, onDrillDown }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="font-semibold text-gray-700 dark:text-slate-300">{label}</p>
        <button
          onClick={() => onDrillDown?.(label)}
          className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          <Calendar className="w-3 h-3" /> {t("kpis.tooltipDetail")}
        </button>
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span className="text-gray-500 dark:text-slate-400">{p.name} :</span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">{p.value}%</span>
        </div>
      ))}
      <p className="text-indigo-500 dark:text-indigo-400 mt-1 opacity-70">{t("kpis.tooltipClickHint")}</p>
    </div>
  );
}

// ── Tooltip graphique barres OEE par WU ──────────────────────────────────────
function BarTooltip({ active, payload, label }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.fill, display: "inline-block" }} />
          <span className="font-semibold text-gray-900 dark:text-slate-100">{p.value}%</span>
          {p.value >= OEE_OBJECTIVE
            ? <span className="text-green-500">✓ {t("kpis.ok")}</span>
            : <span className="text-red-500">✗ {t("kpis.belowObjective")}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Modal drill-down ──────────────────────────────────────────────────────────
function DrillDownModal({ date, dayData, onClose, isDark }) {
  const { t } = useI18n();
  if (!dayData) return null;

  const metrics = [
    { label: t("kpis.oee"),          value: dayData.oee,          unit: "%", color: "#4f46e5" },
    { label: t("kpis.availability"), value: dayData.availability,  unit: "%", color: "#0891b2" },
    { label: t("kpis.performance"),  value: dayData.performance,   unit: "%", color: "#f59e0b" },
    { label: t("kpis.quality"),      value: dayData.quality,       unit: "%", color: "#10b981" },
    { label: t("kpis.losses"),       value: dayData.losses,        unit: " pcs", color: "#ef4444" },
  ];

  const wuRows = dayData.byWorkUnit || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="modal-drilldown">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              {t("kpis.modalTitle", { date })}
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{t("kpis.modalSubtitle")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" data-testid="button-drilldown-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPIs du jour */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {metrics.map((m) => (
            <div key={m.label} className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700">
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{m.label}</p>
              <p className="text-xl font-bold" style={{ color: m.color }}>
                {m.value != null ? m.value : "—"}{m.value != null ? m.unit : ""}
              </p>
            </div>
          ))}
        </div>

        {/* Tableau par WU si disponible */}
        {wuRows.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">{t("kpis.byWorkUnit")}</h4>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    {[t("prod.workUnit"), t("prod.goodQty"), t("prod.defects"), t("prod.scrap"), t("prod.total"), t("prod.yield")].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wuRows.map((wu, i) => {
                    const rate = wu.productionTotal > 0 ? ((wu.goodQty / wu.productionTotal) * 100).toFixed(1) : null;
                    return (
                      <tr key={i} className="border-t border-gray-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-slate-100">{wu.workUnit}</td>
                        <td className="px-3 py-2 text-green-600 dark:text-green-400 font-medium">{wu.goodQty?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-orange-600 dark:text-orange-400">{wu.defectsQty?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">{wu.scrapQty?.toLocaleString()}</td>
                        <td className="px-3 py-2 font-semibold text-gray-900 dark:text-slate-100">{wu.productionTotal?.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          {rate && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                              ${rate >= 95 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : rate >= 80 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                              {rate}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
function Kpis() {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const today     = new Date().toISOString().split("T")[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [from,         setFrom]         = useState(thirtyAgo);
  const [to,           setTo]           = useState(today);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [allWorkUnits, setAllWorkUnits] = useState([]);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);

  const [drillDate, setDrillDate] = useState(null);

  useEffect(() => {
    fetchWorkUnits().then((res) => {
      if (res.workUnits) setAllWorkUnits(res.workUnits);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { from, to };
      if (selectedUnit) params.workUnit = selectedUnit;
      const res = await fetchKpis(params);
      setData(res);
    } catch (err) {
      console.error("KPI load error:", err);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedUnit]);

  useEffect(() => { loadData(); }, [loadData]);

  const summary    = data?.summary    || {};
  const series     = data?.daily      || [];
  const workUnits  = data?.workUnits  || [];

  const oeeColor     = summary.avgOee     >= 75 ? "green" : summary.avgOee     >= 60 ? "orange" : "red";
  const qualityColor = summary.avgQuality >= 98 ? "green" : summary.avgQuality >= 95 ? "orange" : "red";

  const oeeByWU = (data?.byWorkUnit || []).map((wu, i) => ({
    name:  wu.workUnit,
    oee:   wu.avgOee   ?? wu.oee   ?? null,
    color: WU_COLORS[i % WU_COLORS.length],
  })).filter((wu) => wu.oee != null);

  const summaryStats = (() => {
    if (!series.length) return null;
    const pick = (key) => series.map((s) => s[key]).filter((v) => v != null);
    const stats = (arr) => arr.length
      ? { min: Math.min(...arr).toFixed(1), max: Math.max(...arr).toFixed(1), avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) }
      : null;
    return {
      oee:          stats(pick("oee")),
      availability: stats(pick("availability")),
      performance:  stats(pick("performance")),
      quality:      stats(pick("quality")),
    };
  })();

  const drillDayData = drillDate
    ? series.find((s) => s.date === drillDate) || null
    : null;

  const handleChartClick = (chartState) => {
    if (chartState?.activeLabel) setDrillDate(chartState.activeLabel);
  };

  return (
    <div className={ui.page}>

      {/* ── Titre + exports ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={ui.cardHeaderTitle} data-testid="text-kpis-title">{t("kpis.title")}</h1>
          <p className={ui.cardHeaderSub}>{t("kpis.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => downloadExport("excel", null, from, to, selectedUnit)} className={ui.btnSuccess} data-testid="button-kpi-export-excel">
            <FileSpreadsheet className="w-4 h-4" />{t("export.excel")}
          </button>
          <button onClick={() => downloadExport("pdf", null, from, to, selectedUnit)} className={ui.btnDanger} data-testid="button-kpi-export-pdf">
            <FileText className="w-4 h-4" />{t("export.pdf")}
          </button>
        </div>
      </div>

      {/* ── Filtres ──────────────────────────────────────────────────────────── */}
      <div className={ui.filterBar}>
        <div className={ui.filterRow}>
          <FilterField label={t("prod.from")}>
            <CalendarPicker value={from} onChange={setFrom} testId="input-kpi-from" />
          </FilterField>
          <FilterField label={t("prod.to")}>
            <CalendarPicker value={to} onChange={setTo} testId="input-kpi-to" />
          </FilterField>
          <FilterField label={t("filter.allUnits").split(" ").pop()}>
            <WorkUnitCombobox
              workUnits={allWorkUnits.length > 0 ? allWorkUnits : workUnits}
              value={selectedUnit || ""}
              onChange={(v) => setSelectedUnit(v === "All" ? "" : v)}
              testId="select-kpi-workunit"
            />
          </FilterField>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Cards KPI ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="section-kpi-cards">
            <KpiSummaryCard title={t("kpis.oee")}          value={summary.avgOee}          unit="%" icon={Gauge}       color={oeeColor}     />
            <KpiSummaryCard title={t("kpis.availability")} value={summary.avgAvailability} unit="%" icon={CheckCircle} color="blue"         />
            <KpiSummaryCard title={t("kpis.performance")}  value={summary.avgPerformance}  unit="%" icon={Activity}    color="indigo"       />
            <KpiSummaryCard title={t("kpis.quality")}      value={summary.avgQuality}      unit="%" icon={Shield}      color={qualityColor} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className={`${ui.card} p-5`}>
              <div className={ui.cardHeaderSub + " mb-1"}>{t("kpis.totalProduction")}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{(summary.totalProduction || 0).toLocaleString()}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{summary.daysCount || 0} {t("kpis.days")}</div>
            </div>
            <div className={`${ui.card} p-5`}>
              <div className={ui.cardHeaderSub + " mb-1"}>{t("kpis.totalLosses")}</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{(summary.totalLosses || 0).toLocaleString()}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{summary.daysCount || 0} {t("kpis.days")}</div>
            </div>
          </div>

          {/* ── Graphique OEE par unité de travail ─────────────────────────────── */}
          {oeeByWU.length > 0 && (
            <div className={`${ui.card} p-6`} data-testid="section-oee-by-wu">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t("kpis.oeeByWorkUnit")}
                </h2>
                <span className="ml-auto text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                  <span className="inline-block w-8 border-t-2 border-dashed border-red-400" />
                  {t("kpis.objectiveLabel", { value: OEE_OBJECTIVE })}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={oeeByWU} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="name" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
                  <Tooltip content={<BarTooltip />} />
                  <ReferenceLine
                    y={OEE_OBJECTIVE}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    label={{ value: t("kpis.targetValue", { value: OEE_OBJECTIVE }), fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                  />
                  <Bar dataKey="oee" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {oeeByWU.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.oee >= OEE_OBJECTIVE ? "#10b981" : entry.oee >= 60 ? "#f59e0b" : "#ef4444"}
                        opacity={0.9}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Graphique tendance avec objectif + drill-down ─────────────────── */}
          <div className={`${ui.card} p-6`} data-testid="section-kpi-chart">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("kpis.trend")}
              </h2>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {t("kpis.clickHint")}
              </span>
            </div>
            {series.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("chart.noData")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={series}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  onClick={handleChartClick}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis domain={[0, 100]} tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
                  <Tooltip
                    content={<TrendTooltip onDrillDown={setDrillDate} />}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: isDark ? "#94a3b8" : "#64748b" }} />

                  <ReferenceLine
                    y={OEE_OBJECTIVE}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{ value: t("kpis.objectiveValue", { value: OEE_OBJECTIVE }), fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                  />

                  <Line type="monotone" dataKey="oee"         name={t("kpis.oee")}         stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 5, cursor: "pointer" }} />
                  <Line type="monotone" dataKey="quality"     name={t("kpis.quality")}     stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                  {series.some((s) => s.performance != null) && (
                    <Line type="monotone" dataKey="performance" name={t("kpis.performance")} stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Tableau récapitulatif min / max / moyenne ─────────────────────── */}
          {summaryStats && (
            <div className={`${ui.card} overflow-hidden`} data-testid="section-kpi-summary-table">
              <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {t("kpis.summaryTitle")}
                </h2>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  {t("kpis.summarySubtitle")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                      <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-slate-400">{t("kpis.indicator")}</th>
                      <th className="text-center px-4 py-3 font-medium text-blue-600 dark:text-blue-400">{t("kpis.min")}</th>
                      <th className="text-center px-4 py-3 font-medium text-indigo-600 dark:text-indigo-400">{t("kpis.average")}</th>
                      <th className="text-center px-4 py-3 font-medium text-green-600 dark:text-green-400">{t("kpis.max")}</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-slate-400">{t("kpis.objective")}</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-slate-400">{t("kpis.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: t("kpis.oee"),           key: "oee",          obj: OEE_OBJECTIVE, color: "#6366f1" },
                      { label: t("kpis.availability"),  key: "availability", obj: 90,            color: "#0891b2" },
                      { label: t("kpis.performance"),   key: "performance",  obj: 90,            color: "#f59e0b" },
                      { label: t("kpis.quality"),       key: "quality",      obj: 95,            color: "#10b981" },
                    ].map(({ label, key, obj, color }) => {
                      const s   = summaryStats[key];
                      if (!s) return null;
                      const avg = parseFloat(s.avg);
                      const ok  = avg >= obj;
                      return (
                        <tr key={key} className="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                              <span className="font-medium text-gray-900 dark:text-slate-100">{label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-mono font-semibold">{s.min}%</td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-gray-900 dark:text-slate-100">{s.avg}%</td>
                          <td className="px-4 py-3 text-center text-green-600 dark:text-green-400 font-mono font-semibold">{s.max}%</td>
                          <td className="px-4 py-3 text-center text-gray-400 dark:text-slate-500 font-mono">{obj}%</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold
                              ${ok
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                              {ok ? t("kpis.achieved") : t("kpis.notAchieved")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal drill-down ─────────────────────────────────────────────────── */}
      {drillDate && (
        <DrillDownModal
          date={drillDate}
          dayData={drillDayData}
          onClose={() => setDrillDate(null)}
          isDark={isDark}
        />
      )}
    </div>
  );
}

export default Kpis;