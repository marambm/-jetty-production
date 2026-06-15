import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp, Loader2, Brain,
  ArrowUpRight, ArrowDownRight, Minus, BarChart2, Target,
} from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, ReferenceLine,
} from "recharts";
import { useI18n } from "../i18n/I18nProvider";
import { fetchForecast, fetchWorkUnits } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import CalendarPicker from "../components/CalendarPicker";
import WorkUnitCombobox from "../components/WorkUnitCombobox";
import FilterField from "../components/FilterField";
import { ui } from "../components/uiStyles";

function ConfidenceBadge({ value }) {
  const { t } = useI18n();
  const color = value >= 80
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : value >= 60
    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {value}%
    </span>
  );
}

function TrendBadge({ trend }) {
  const { t } = useI18n();
  if (trend === "up")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <ArrowUpRight className="w-3 h-3" /> {t("fc.trendUp")}
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <ArrowDownRight className="w-3 h-3" /> {t("fc.trendDown")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
      <Minus className="w-3 h-3" /> {t("fc.trendStable")}
    </span>
  );
}

function ForecastTooltip({ active, payload, label, isDark }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const actual   = payload.find((p) => p.dataKey === "actual")?.value;
  const forecast = payload.find((p) => p.dataKey === "forecast")?.value;
  const lower    = payload.find((p) => p.dataKey === "lower")?.value;
  const upper    = payload.find((p) => p.dataKey === "upper")?.value;
  const diff     = actual != null && forecast != null ? forecast - actual : null;
  const diffPct  = diff != null && actual > 0 ? ((diff / actual) * 100).toFixed(1) : null;
  const isUp     = diff != null && diff >= 0;
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2 pb-2 border-b border-gray-100 dark:border-slate-800">{label}</p>
      {actual != null && (
        <div className="flex justify-between gap-6 mb-1">
          <span className="text-gray-500 dark:text-slate-400">{t("fc.tooltipActual")} :</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{actual.toLocaleString()}</span>
        </div>
      )}
      {forecast != null && (
        <div className="flex justify-between gap-6 mb-1">
          <span className="text-gray-500 dark:text-slate-400">{t("fc.tooltipForecast")} :</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">{forecast.toLocaleString()}</span>
        </div>
      )}
      {lower != null && upper != null && (
        <div className="flex justify-between gap-6 mb-1">
          <span className="text-gray-500 dark:text-slate-400">{t("fc.tooltipRange")} :</span>
          <span className="text-gray-600 dark:text-slate-300">{lower.toLocaleString()} – {upper.toLocaleString()}</span>
        </div>
      )}
      {diff != null && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 flex justify-between gap-6">
          <span className="text-gray-500 dark:text-slate-400">{t("fc.tooltipDiff")} :</span>
          <span className={`font-semibold ${isUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {isUp ? "+" : ""}{diff.toLocaleString()}
            {diffPct != null && <span className="opacity-70 ml-1">({isUp ? "+" : ""}{diffPct}%)</span>}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Convertit results[] (nouvelle API) → forecasts[] plat ────────────────────
function flattenResults(results = []) {
  const forecasts = [];
  for (const wu of results) {
    const horizon =
      wu.horizons?.["j+14"] ??
      wu.horizons?.["j+7"]  ??
      wu.horizons?.["j+3"];
    if (!horizon?.days) continue;

    for (const day of horizon.days) {
      forecasts.push({
        forecastForDate: day.date,
        workUnit:        wu.workUnit,
        yhat:            day.value,
        yhatLower:       day.yhatLower ?? Math.round(day.value * 0.9),
        yhatUpper:       day.yhatUpper ?? Math.round(day.value * 1.1),
        confidence:      day.source === "actual" ? 100 : (day.confidence ?? 75),
        modelVersion:    day.source === "actual" ? "actual" : (day.modelVersion ?? "ai"),
        source:          day.source ?? "ai",
        mae:             wu.mae      ?? null,
        rmse:            wu.rmse     ?? null,
        testSize:        wu.testSize ?? null,
      });
    }
  }
  return forecasts;
}

function Forecast() {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const today  = new Date().toISOString().split("T")[0];

  const [baseDate,     setBaseDate]     = useState(today);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [allWorkUnits, setAllWorkUnits] = useState([]);
  const [days,         setDays]         = useState(7);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    fetchWorkUnits().then((res) => {
      if (res.workUnits) setAllWorkUnits(res.workUnits);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date: baseDate, days };
      if (selectedUnit) params.workUnit = selectedUnit;
      const res = await fetchForecast(params);
      setData(res);
    } catch (err) {
      console.error("Forecast load error:", err);
    } finally {
      setLoading(false);
    }
  }, [baseDate, selectedUnit, days]);

  useEffect(() => { loadData(); }, [loadData]);

  const history       = data?.history       || [];
  const workUnits     = data?.workUnits     || [];
  const periodMetrics = data?.periodMetrics ?? null;

  const forecasts = useMemo(() => {
    if (data?.results?.length > 0) return flattenResults(data.results);
    return data?.forecasts || [];
  }, [data]);

  const modelMeta = useMemo(() => {
    const f = forecasts.find((f) => f.mae != null && f.rmse != null);
    if (!f) return null;
    return { mae: f.mae, rmse: f.rmse, testSize: f.testSize ?? null };
  }, [forecasts]);

  const aggregatedForecasts = {};
  for (const f of forecasts) {
    if (!aggregatedForecasts[f.forecastForDate]) {
      aggregatedForecasts[f.forecastForDate] = {
        date: f.forecastForDate, yhat: 0, yhatLower: 0, yhatUpper: 0, count: 0, confidenceSum: 0,
      };
    }
    const agg = aggregatedForecasts[f.forecastForDate];
    agg.yhat          += f.yhat        || 0;
    agg.yhatLower     += f.yhatLower   || 0;
    agg.yhatUpper     += f.yhatUpper   || 0;
    agg.count         += 1;
    agg.confidenceSum += f.confidence  || 0;
  }
  const forecastSeries = Object.values(aggregatedForecasts).sort((a, b) => a.date.localeCompare(b.date));

  const historyMap = Object.fromEntries(history.map((h) => [h.date, h.productionTotal]));

  const realByDateUnit = useMemo(() => {
    const map = {};
    for (const wu of (data?.results || [])) {
      const horizon = wu.horizons?.["j+14"] ?? wu.horizons?.["j+7"] ?? wu.horizons?.["j+3"];
      for (const day of (horizon?.days || [])) {
        if (day.source === "actual") {
          map[`${day.date}|${wu.workUnit}`] = day.value;
        }
      }
    }
    return map;
  }, [data]);

  const forecastMap = Object.fromEntries(forecastSeries.map((f) => [f.date, f]));
  const allDates    = [...new Set([...history.map((h) => h.date), ...forecastSeries.map((f) => f.date)])].sort();

  const chartData = allDates.map((date) => {
    const actual = historyMap[date]  ?? null;
    const fcast  = forecastMap[date] ?? null;
    return {
      date,
      actual,
      forecast: fcast ? Math.round(fcast.yhat)     : null,
      lower:    fcast ? Math.round(fcast.yhatLower) : null,
      upper:    fcast ? Math.round(fcast.yhatUpper) : null,
    };
  });

  const uniqueForecasts = [];
  const seenDates = new Set();
  for (const f of forecasts) {
    const key = f.forecastForDate + "|" + f.workUnit;
    if (!seenDates.has(key)) { seenDates.add(key); uniqueForecasts.push(f); }
  }

  const totalForecast = forecastSeries.reduce((a, f) => a + f.yhat, 0);
  const avgConfidence = forecastSeries.length > 0
    ? Math.round(forecastSeries.reduce((a, f) => a + (f.count > 0 ? f.confidenceSum / f.count : 0), 0) / forecastSeries.length)
    : 0;

  const trendByUnit = useMemo(() => {
    const unitMap = {};
    for (const f of forecasts) {
      if (f.source === "actual") continue;
      if (!unitMap[f.workUnit]) unitMap[f.workUnit] = [];
      unitMap[f.workUnit].push({ date: f.forecastForDate, yhat: f.yhat });
    }
    const result = {};
    for (const [unit, pts] of Object.entries(unitMap)) {
      const sorted = pts.sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length < 2) { result[unit] = "stable"; continue; }
      const half  = Math.ceil(sorted.length / 2);
      const first = sorted.slice(0, half).reduce((s, p) => s + p.yhat, 0) / half;
      const last  = sorted.slice(half).reduce((s, p)  => s + p.yhat, 0) / Math.max(sorted.length - half, 1);
      const delta = ((last - first) / Math.max(first, 1)) * 100;
      result[unit] = delta > 3 ? "up" : delta < -3 ? "down" : "stable";
    }
    return result;
  }, [forecasts]);

  return (
    <div className={ui.page}>
      <div>
        <h1 className={ui.cardHeaderTitle} data-testid="text-forecast-title">{t("fc.title")}</h1>
        <p className={ui.cardHeaderSub}>{t("fc.subtitle")}</p>
      </div>

      {/* Filtres */}
      <div className={ui.filterBar}>
        <div className={ui.filterRow}>
          <FilterField label={t("prod.date")}>
            <CalendarPicker value={baseDate} onChange={setBaseDate} testId="input-forecast-date" />
          </FilterField>
          <FilterField label={t("filter.allUnits").split(" ").pop()}>
            <WorkUnitCombobox
              workUnits={allWorkUnits.length > 0 ? allWorkUnits : workUnits}
              value={selectedUnit || ""}
              onChange={(v) => setSelectedUnit(v === "All" ? "" : v)}
              testId="select-forecast-workunit"
            />
          </FilterField>
          <FilterField label={t("fc.days")} className="max-w-[140px]">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={ui.select} data-testid="select-forecast-days">
              <option value={3}>3</option>
              <option value={7}>7</option>
              <option value={14}>14</option>
            </select>
          </FilterField>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
        </div>
      ) : forecasts.length === 0 ? (
        <div className={`${ui.card} p-12 flex flex-col items-center justify-center gap-4`}>
          <TrendingUp className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("fc.noData")}</p>
        </div>
      ) : (
        <>
          {/* Cards résumé */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5" data-testid="section-forecast-summary">
            <div className={`${ui.card} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-indigo-500" />
                <span className={ui.cardHeaderSub + " !mt-0"}>{t("fc.predicted")}</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{Math.round(totalForecast).toLocaleString()}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{days} {t("kpis.days")}</div>
            </div>

            <div className={`${ui.card} p-5`}>
              <div className={ui.cardHeaderSub + " mb-2 !mt-0"}>{t("fc.confidence")}</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{avgConfidence}%</div>
              <div className="mt-2"><ConfidenceBadge value={avgConfidence} /></div>
            </div>

            <div className={`${ui.card} p-5`} data-testid="card-model-accuracy">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-indigo-500" />
                <span className={ui.cardHeaderSub + " !mt-0"}>{t("fc.modelAccuracy")}</span>
              </div>
              {(modelMeta || periodMetrics) ? (
                <div className="space-y-2">
                  {modelMeta && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{t("fc.maeModel")}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {modelMeta.mae.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-slate-400">{t("common.pcs")}</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{t("fc.rmseModel")}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {modelMeta.rmse.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-slate-400">{t("common.pcs")}</span>
                        </span>
                      </div>
                      {modelMeta.testSize != null && (
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {t("fc.calculatedOn", { count: modelMeta.testSize })}
                        </div>
                      )}
                    </>
                  )}
                  {periodMetrics && (
                    <div className="border-t border-gray-100 dark:border-slate-800 pt-2 mt-1 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{t("fc.maeActual")}</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                          {periodMetrics.mae.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-slate-400">{t("common.pcs")}</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{t("fc.rmseActual")}</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                          {periodMetrics.rmse.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-slate-400">{t("common.pcs")}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-400 dark:text-slate-500">
                  <p className="font-mono text-xs">{forecasts[0]?.modelVersion || "N/A"}</p>
                  <p className="text-xs mt-1">{forecasts[0]?.source || ""}</p>
                  <p className="text-xs mt-2 opacity-60">{t("fc.modelAccuracyHelp")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Tendance par unité */}
          {Object.keys(trendByUnit).length > 0 && (
            <div className={`${ui.card} p-5`} data-testid="section-trend-by-unit">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{t("fc.trendTitle")}</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(trendByUnit).map(([unit, trend]) => (
                  <div key={unit} className="flex items-center gap-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 border border-gray-100 dark:border-slate-700">
                    <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{unit}</span>
                    <TrendBadge trend={trend} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graphique */}
          <div className={`${ui.card} p-6`} data-testid="section-forecast-chart">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("fc.historyVsForecast")}</h2>
              <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><span className="inline-block w-6 h-0.5 bg-green-500" /> {t("fc.legendActual")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-indigo-500" /> {t("fc.legendForecast")}</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded" style={{ background: isDark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.15)" }} />
                  {t("fc.legendConfidence")}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                <XAxis dataKey="date" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
                <Tooltip content={<ForecastTooltip isDark={isDark} />} />
                <Legend wrapperStyle={{ fontSize: 12, color: isDark ? "#94a3b8" : "#64748b" }} />
                <Area type="monotone" dataKey="upper" name={t("fc.upperBound")} fill={isDark ? "rgba(99,102,241,0.20)" : "rgba(99,102,241,0.12)"} stroke="none" legendType="none" connectNulls={false} />
                <Area type="monotone" dataKey="lower" name={t("fc.lowerBound")} fill={isDark ? "#0f172a" : "#ffffff"} stroke="none" legendType="none" connectNulls={false} />
                <ReferenceLine x={baseDate} stroke={isDark ? "#475569" : "#cbd5e1"} strokeDasharray="4 2" label={{ value: t("fc.today"), fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10, position: "insideTopRight" }} />
                <Line type="monotone" dataKey="actual" name={t("fc.legendActual")} stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: "#10b981" }} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name={t("fc.predicted")} stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: "#6366f1" }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Table prévisions détaillées */}
          <div className={`${ui.card} overflow-hidden`} data-testid="section-forecast-table">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{t("fc.detailsTitle")}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("prod.date")}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.workUnit")}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.trend")}</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.predicted")}</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.lower")}</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.upper")}</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t("fc.confidence")}</th>
                    <th className="text-right px-4 py-3 font-medium text-green-600 dark:text-green-400">{t("fc.actual")}</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueForecasts.map((f, i) => {
                    const real = realByDateUnit[`${f.forecastForDate}|${f.workUnit}`] ?? null;
                    return (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-mono text-xs">{f.forecastForDate}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-medium">{f.workUnit}</td>
                        <td className="px-4 py-3"><TrendBadge trend={trendByUnit[f.workUnit] || "stable"} /></td>
                        <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400 font-semibold">{Math.round(f.yhat).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{Math.round(f.yhatLower).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{Math.round(f.yhatUpper).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">{f.confidence ? <ConfidenceBadge value={f.confidence} /> : "--"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                          {real != null ? real.toLocaleString() : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Forecast;