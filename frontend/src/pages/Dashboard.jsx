import { useState, useCallback, useRef, useEffect } from "react";
import { Factory, Target, Gauge, Trash2, Loader2, AlertCircle, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { fetchDashboard, fetchAlerts, downloadExport, fetchWorkUnits, fetchProduction } from "../api/client";
import FilterBar from "../components/FilterBar";
import KpiCard from "../components/KpiCard";
import ProductionLineChart from "../components/ProductionLineChart";
import AlertsPanel from "../components/AlertsPanel";
import WorkUnitTable from "../components/WorkUnitTable";
import WeeklyHeatmap from "../components/WeeklyHeatmap";
import ComparisonChart from "../components/ComparisonChart";
import { ui } from "../components/uiStyles";

const FALLBACK = {
  date: new Date().toISOString().split("T")[0],
  totals: { goodQty: 0, defectsQty: 0, scrapQty: 0, productionTotal: 0, theoreticalSeconds: 0 },
  byWorkUnit: [],
  series: [],
  forecast: null,
};

const DEFAULT_THRESHOLDS = {
  rendementWarning: 85,
  rendementCritical: 70,
  pertesWarning: 10,
  pertesCritical: 20,
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function Dashboard() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [selectedUnit, setSelectedUnit] = useState("All");
  const [rangeLen, setRangeLen] = useState(30);

  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [allWorkUnits, setAllWorkUnits] = useState([]);

  const [allRecords, setAllRecords] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [showComparison, setShowComparison] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const [dailyObjective, setDailyObjective] = useState(null);

  const chartRef = useRef(null);
  const dateRef = useRef(date);
  const selectedUnitRef = useRef(selectedUnit);

  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => { selectedUnitRef.current = selectedUnit; }, [selectedUnit]);

  const loadData = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, alertsRes] = await Promise.allSettled([
        fetchDashboard(d),
        fetchAlerts(d),
      ]);
      if (dashRes.status === "fulfilled") {
        setData(dashRes.value);
      } else {
        console.error("Dashboard fetch failed:", dashRes.reason);
        setError(dashRes.reason?.message || t('errors.dashboardFetchFailed'));
        setData(FALLBACK);
      }
      if (alertsRes.status === "fulfilled") {
        setAlerts(alertsRes.value.alerts || []);
      } else {
        setAlerts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadDailyObjective = useCallback(async (forceDate, forceUnit) => {
    try {
      const token = localStorage.getItem("jetty-token");
      const currentDate = forceDate ?? dateRef.current;
      const unit = forceUnit !== undefined ? forceUnit : selectedUnitRef.current;
      const unitKey = unit !== "All" ? unit : "global";

      const res = await fetch(`/api/settings/daily-objectives?date=${currentDate}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();

      if (json.ok && json.objectives) {
        const match = json.objectives.find(
          (o) => o.date === currentDate && o.workUnit === unitKey
        );
        const fallbackDate = json.objectives.find(
          (o) => o.date === currentDate && o.workUnit === "global"
        );
        setDailyObjective(match?.objective ?? fallbackDate?.objective ?? null);
      } else {
        setDailyObjective(null);
      }
    } catch {
      setDailyObjective(null);
    }
  }, []);

  useEffect(() => {
    loadDailyObjective(date, selectedUnit);
  }, [date, selectedUnit, loadDailyObjective]);

  const reloadSettingsAndAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch("/api/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok && json.settings?.thresholds) {
        setThresholds((prev) => ({ ...prev, ...json.settings.thresholds }));
      }
    } catch (err) {
      console.warn("Settings fetch failed:", err.message);
    }

    try {
      const alertsRes = await fetchAlerts(dateRef.current);
      setAlerts(alertsRes.alerts || []);
    } catch (err) {
      console.warn("Alerts reload failed:", err.message);
    }

    await loadDailyObjective(dateRef.current, selectedUnitRef.current);
  }, [loadDailyObjective]);

  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e.detail?.thresholds) {
        setThresholds((prev) => ({ ...prev, ...e.detail.thresholds }));
      }
      loadDailyObjective(dateRef.current, selectedUnitRef.current);
    };
    window.addEventListener("jetty-settings-updated", handleSettingsUpdate);
    return () => window.removeEventListener("jetty-settings-updated", handleSettingsUpdate);
  }, [loadDailyObjective]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "jetty-settings-updated") {
        try {
          const payload = JSON.parse(e.newValue);
          if (payload?.date) {
            loadDailyObjective(dateRef.current, selectedUnitRef.current);
            return;
          }
        } catch {}
        reloadSettingsAndAlerts();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadDailyObjective, reloadSettingsAndAlerts]);

  useEffect(() => {
    reloadSettingsAndAlerts();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reloadSettingsAndAlerts();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [reloadSettingsAndAlerts]);

  const loadAllForChart = useCallback(async () => {
    setChartLoading(true);
    try {
      const toDate   = new Date(date + "T00:00:00");
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - rangeLen + 1);
      const from = fromDate.toISOString().split("T")[0];
      const to   = date;

      const params = { from, to, limit: 2000, skip: 0 };
      if (selectedUnit !== "All") params.workUnit = selectedUnit;

      const res = await fetchProduction(params);
      setAllRecords(res.records || []);
    } catch (err) {
      console.error("Chart load error:", err);
      setAllRecords([]);
    } finally {
      setChartLoading(false);
    }
  }, [date, rangeLen, selectedUnit]);

  useEffect(() => { loadData(date); },    [date, loadData]);
  useEffect(() => { loadAllForChart(); }, [loadAllForChart]);

  useEffect(() => {
    fetchWorkUnits().then((res) => {
      if (res.workUnits) setAllWorkUnits(res.workUnits);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLastRefresh(new Date());
    setCountdown(REFRESH_INTERVAL_MS / 1000);

    const refreshInterval = setInterval(() => {
      loadData(date);
      loadAllForChart();
      loadDailyObjective(dateRef.current, selectedUnitRef.current);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(refreshInterval);
  }, [date, loadData, loadAllForChart, loadDailyObjective]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : REFRESH_INTERVAL_MS / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const dashboard     = data || FALLBACK;
  const workUnitNames = allWorkUnits.length > 0 ? allWorkUnits : dashboard.byWorkUnit.map((w) => w.workUnit);
  const totals        = dashboard.totals || FALLBACK.totals;

  const filteredTotals =
    selectedUnit === "All"
      ? totals
      : (() => {
          const wu = dashboard.byWorkUnit.find((w) => w.workUnit === selectedUnit);
          if (!wu) return totals;
          return {
            goodQty:            wu.goodQty            ?? 0,
            defectsQty:         wu.defectsQty         ?? 0,
            scrapQty:           wu.scrapQty           ?? 0,
            productionTotal:    wu.productionTotal    ?? 0,
            theoreticalSeconds: wu.theoreticalSeconds ?? 0,
          };
        })();

  const filteredTable  = selectedUnit === "All" ? dashboard.byWorkUnit : dashboard.byWorkUnit.filter((w) => w.workUnit === selectedUnit);
  const filteredAlerts = selectedUnit === "All" ? alerts               : alerts.filter((a) => a.workUnit === selectedUnit);

  const chartDataFallback = (dashboard.series || []).slice(-rangeLen);
  const chartData = allRecords.length > 0 ? allRecords : chartDataFallback;
  const sparkData = (dashboard.series || []).slice(-14);

  const yesterdayProd = dashboard.series?.length >= 2
    ? dashboard.series[dashboard.series.length - 2].productionTotal : null;
  const prodDelta = yesterdayProd != null ? filteredTotals.productionTotal - yesterdayProd : null;

  const yesterdayYield = (() => {
    if (!dashboard.series || dashboard.series.length < 2) return null;
    const prev = dashboard.series[dashboard.series.length - 2];
    if (!prev || prev.productionTotal <= 0) return null;
    return (prev.goodQty / prev.productionTotal) * 100;
  })();

  const currentYield = filteredTotals.productionTotal > 0
    ? (filteredTotals.goodQty / filteredTotals.productionTotal) * 100 : null;
  const yieldDelta = yesterdayYield != null && currentYield != null
    ? parseFloat((currentYield - yesterdayYield).toFixed(2)) : null;

  const yesterdayLoss = (() => {
    if (!dashboard.series || dashboard.series.length < 2) return null;
    const prev = dashboard.series[dashboard.series.length - 2];
    return prev ? (prev.defectsQty ?? 0) + (prev.scrapQty ?? 0) : null;
  })();
  const currentLoss = filteredTotals.defectsQty + filteredTotals.scrapQty;
  const lossDelta   = yesterdayLoss != null ? currentLoss - yesterdayLoss : null;

  const chartNote = selectedUnit !== "All" ? t("chart.allUnitsNote") : null;

  const objectiveSubtitle = (() => {
    if (dailyObjective != null && dailyObjective > 0) {
      const pct = ((filteredTotals.goodQty / dailyObjective) * 100).toFixed(1);
      return `${pct}% ${t("kpi.achieved")}`;
    }
    if (filteredTotals.productionTotal > 0) {
      const pct = ((filteredTotals.goodQty / filteredTotals.productionTotal) * 100).toFixed(1);
      return `${pct}% ${t("kpi.achieved")}`;
    }
    return null;
  })();

  const objectiveColor = (() => {
    if (dailyObjective != null) {
      return filteredTotals.goodQty >= dailyObjective ? "green" : "orange";
    }
    return filteredTotals.goodQty >= filteredTotals.productionTotal ? "green" : "orange";
  })();

  // ✅ Couleur pertes : dépasse pertesCritical → rouge, dépasse pertesWarning → orange, sinon vert
  const lossColor = (() => {
    if (currentLoss > thresholds.pertesCritical) return "red";
    if (currentLoss > thresholds.pertesWarning)  return "orange";
    return "green";
  })();

  const handleRowClick = useCallback((unitName) => {
    setSelectedUnit(unitName);
    loadDailyObjective(dateRef.current, unitName);
    if (chartRef.current) {
      chartRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loadDailyObjective]);

  const handleRefresh = useCallback(() => {
    setSelectedUnit("All");
    setRangeLen(30);
    loadData(date);
    loadAllForChart();
    reloadSettingsAndAlerts();
    setLastRefresh(new Date());
    setCountdown(REFRESH_INTERVAL_MS / 1000);
  }, [date, loadData, loadAllForChart, reloadSettingsAndAlerts]);

  const handleDateChange = useCallback((newDate) => {
    setDate(newDate);
    setSelectedUnit("All");
    loadDailyObjective(newDate, "All");
  }, [loadDailyObjective]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96" data-testid="loading-state">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className={ui.cardHeaderSub}>{t('dashboard.loadingInitial')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={ui.cardHeaderTitle} data-testid="text-dashboard-title">{t("dashboard.title")}</h1>
          <p className={ui.cardHeaderSub}>{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin text-indigo-400" : "text-green-500"}`} />
            <span>
              {lastRefresh
                ? t('dashboard.lastRefresh', { time: lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
                : t('dashboard.loadingStatus')}
            </span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono text-indigo-500 dark:text-indigo-400">{formatCountdown(countdown)}</span>
          </div>

          {loading && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" data-testid="loading-inline" />}

          <button
            onClick={() => setShowComparison((v) => !v)}
            className={`px-3 py-1.5 text-xs border rounded-lg transition-colors font-medium
              ${showComparison
                ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400"
                : "border-gray-300 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
          >
            {showComparison ? "▼" : "▶"} {t('dashboard.comparison')}
          </button>

          <button onClick={() => downloadExport("excel", date)} className={ui.btnSuccess} data-testid="button-export-excel">
            <FileSpreadsheet className="w-4 h-4" />{t("export.excel")}
          </button>
          <button onClick={() => downloadExport("pdf", date)} className={ui.btnDanger} data-testid="button-export-pdf">
            <FileText className="w-4 h-4" />{t("export.pdf")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400" data-testid="error-state">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FilterBar
        date={date}
        onDateChange={handleDateChange}
        workUnits={workUnitNames}
        selectedUnit={selectedUnit}
        onUnitChange={setSelectedUnit}
        onQuickRange={setRangeLen}
        onRefresh={handleRefresh}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="section-kpis">
        <KpiCard
          title={t("kpi.productionToday")}
          value={filteredTotals.productionTotal}
          icon={Factory}
          color="indigo"
          delta={prodDelta}
          sparkData={sparkData}
        />
        <KpiCard
          title={t("kpi.goodPieces")}
          value={filteredTotals.goodQty ?? 0}
          subtitle={objectiveSubtitle}
          icon={Target}
          color={objectiveColor}
          sparkData={sparkData}
        />
        {/* ✅ invertDelta=true : hausse des pertes = rouge (mauvais) */}
        <KpiCard
          title={t("kpi.losses")}
          value={currentLoss}
          subtitle={`${filteredTotals.defectsQty} ${t('kpi.defects')} + ${filteredTotals.scrapQty} ${t('kpi.scrap')}`}
          icon={Trash2}
          color={lossColor}
          delta={lossDelta}
          invertDelta={true}
        />
        <KpiCard
          title={t("kpi.rendement")}
          value={currentYield != null ? `${currentYield.toFixed(1)}%` : "—"}
          icon={Gauge}
          color={(() => {
            if (currentYield == null) return "orange";
            if (currentYield >= thresholds.rendementWarning)  return "green";
            if (currentYield >= thresholds.rendementCritical) return "orange";
            return "red";
          })()}
          delta={yieldDelta}
        />
      </div>

      <AlertsPanel
        alerts={filteredAlerts}
        byWorkUnit={dashboard.byWorkUnit}
        series={dashboard.series}
        thresholds={thresholds}
      />

      <div ref={chartRef} className={`${ui.card} p-6`} data-testid="section-chart-wrapper">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t("table.production")} &mdash; {rangeLen === 7 ? t("chart.last7") : t("chart.last30")}
        </h2>
        {chartLoading ? (
          <div className="flex items-center justify-center h-60 gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            {t('dashboard.chartLoading')}
          </div>
        ) : (
          <ProductionLineChart data={chartData} note={chartNote} />
        )}
      </div>

      {showComparison && (
        <ComparisonChart date={date} rangeLen={rangeLen === 7 ? 7 : 14} workUnit={selectedUnit} />
      )}

      <WeeklyHeatmap series={dashboard.series} thresholds={thresholds} />

      <WorkUnitTable data={filteredTable} onRowClick={handleRowClick} />
    </div>
  );
}

export default Dashboard;