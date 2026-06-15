import { useState } from "react";
import { AlertTriangle, CheckCircle2, X, Lightbulb, TrendingDown, Clock } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

const levelStyles = {
  red:        "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
  orange:     "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20",
  suggestion: "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/20",
};

const badgeStyles = {
  red:        "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  orange:     "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  suggestion: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400",
};

const badgeDot = {
  red:        "bg-red-500",
  orange:     "bg-orange-500",
  suggestion: "bg-indigo-400",
};

const levelLabel = {
  red:        "Critical",
  orange:     "Warning",
  suggestion: "Suggestion",
};

/**
 * Génère des suggestions proactives à partir des données du tableau de bord.
 * `byWorkUnit` = dashboard.byWorkUnit  (tableau [{workUnit, goodQty, productionTotal, ...}])
 * `series`     = dashboard.series      (historique [{date, productionTotal, ...}])
 * `thresholds` = { rendementWarning, rendementCritical }
 */
function buildSmartSuggestions(byWorkUnit = [], series = [], thresholds = {}) {
  const suggestions = [];
  const warnT = thresholds.rendementWarning ?? 85;

  // ── 1. Unités sous objectif plusieurs jours d'affilée ─────────────────────
  // On regroupe les 7 derniers jours de la série par workUnit si dispo
  const recentByUnit = {};
  const recent7 = series.slice(-7);
  recent7.forEach((day) => {
    (day.byWorkUnit || []).forEach(({ workUnit, goodQty, productionTotal }) => {
      if (!recentByUnit[workUnit]) recentByUnit[workUnit] = [];
      const rate = productionTotal > 0 ? (goodQty / productionTotal) * 100 : null;
      if (rate !== null) recentByUnit[workUnit].push(rate);
    });
  });

  Object.entries(recentByUnit).forEach(([unit, rates]) => {
    const belowCount = rates.filter((r) => r < warnT).length;
    if (belowCount >= 3) {
      suggestions.push({
        _id: `smart-below-${unit}`,
        level: "suggestion",
        workUnit: unit,
        icon: "trend",
        message: `${unit} est sous l'objectif de rendement (${warnT}%) depuis ${belowCount} jour${belowCount > 1 ? "s" : ""} — vérifiez la ligne.`,
      });
    }
  });

  // ── 2. Taux de perte élevé sur une unité aujourd'hui ──────────────────────
  byWorkUnit.forEach(({ workUnit, defectsQty, scrapQty, productionTotal }) => {
    if (!productionTotal) return;
    const lossRate = ((defectsQty + scrapQty) / productionTotal) * 100;
    if (lossRate >= 8) {
      suggestions.push({
        _id: `smart-loss-${workUnit}`,
        level: "suggestion",
        workUnit,
        icon: "loss",
        message: `${workUnit} affiche ${lossRate.toFixed(1)}% de pertes aujourd'hui — une inspection qualité est recommandée.`,
      });
    }
  });

  // ── 3. Production faible vs moyenne historique ────────────────────────────
  if (series.length >= 7) {
    const avg7 = series.slice(-7).reduce((s, d) => s + (d.productionTotal || 0), 0) / 7;
    const last  = series[series.length - 1]?.productionTotal || 0;
    if (last < avg7 * 0.85) {
      suggestions.push({
        _id: "smart-prod-low",
        level: "suggestion",
        icon: "clock",
        message: `La production du jour (${last.toLocaleString()}) est 15%+ en dessous de la moyenne des 7 derniers jours (${Math.round(avg7).toLocaleString()}).`,
      });
    }
  }

  return suggestions;
}

function SuggestionIcon({ type }) {
  if (type === "trend") return <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" />;
  if (type === "clock") return <Clock         className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" />;
  return                        <Lightbulb    className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" />;
}

function AlertsPanel({ alerts, byWorkUnit, series, thresholds }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Alertes réelles (API)
  const realAlerts = (alerts || []).filter((a) => !dismissed.includes(a._id || a.message));

  // Suggestions proactives générées côté client
  const smartSuggestions = buildSmartSuggestions(byWorkUnit, series, thresholds)
    .filter((s) => !dismissed.includes(s._id));

  const dismiss = (id) => setDismissed((prev) => [...prev, id]);

  const hasAnything = realAlerts.length > 0 || (showSuggestions && smartSuggestions.length > 0);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-5"
      data-testid="alerts-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3
          className="text-sm font-semibold text-gray-900 dark:text-slate-100 uppercase tracking-wider"
          data-testid="text-alerts-title"
        >
          {t("alerts.title")}
        </h3>
        {smartSuggestions.length > 0 && (
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 transition-colors"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            {showSuggestions ? "Masquer" : "Afficher"} suggestions ({smartSuggestions.length})
          </button>
        )}
      </div>

      {/* Aucune alerte ET aucune suggestion */}
      {!hasAnything && (
        <div
          className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
          data-testid="text-no-alerts"
        >
          <CheckCircle2 className="w-4 h-4" />
          {t("alerts.noAlerts")}
        </div>
      )}

      <div className="space-y-2">
        {/* ── Alertes réelles (API) ──────────────────────────────────────────── */}
        {realAlerts.map((alert, idx) => {
          const level = alert.level || "orange";
          const key   = alert._id || `alert-${idx}`;
          return (
            <div
              key={key}
              className={`flex items-start gap-3 rounded-xl border p-3 ${levelStyles[level] || levelStyles.orange}`}
              data-testid={`alert-${key}`}
            >
              <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${level === "red" ? "text-red-500" : "text-orange-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[level] || badgeStyles.orange}`} data-testid={`badge-alert-level-${key}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${badgeDot[level] || badgeDot.orange}`} />
                    {levelLabel[level] || "Warning"}
                  </span>
                  {alert.type     && <span className="text-xs text-gray-400 dark:text-slate-500">{alert.type}</span>}
                  {alert.workUnit && <span className="text-xs font-medium text-gray-600 dark:text-slate-300">{alert.workUnit}</span>}
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{alert.message}</p>
              </div>
              <button onClick={() => dismiss(key)} className="flex-shrink-0 p-1 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700/60 transition-colors" title={t("alerts.resolve")} data-testid={`button-dismiss-${key}`}>
                <X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              </button>
            </div>
          );
        })}

        {/* ── Suggestions proactives ─────────────────────────────────────────── */}
        {showSuggestions && smartSuggestions.map((s) => (
          <div
            key={s._id}
            className={`flex items-start gap-3 rounded-xl border p-3 ${levelStyles.suggestion}`}
            data-testid={`alert-${s._id}`}
          >
            <SuggestionIcon type={s.icon} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles.suggestion}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${badgeDot.suggestion}`} />
                  Suggestion
                </span>
                {s.workUnit && <span className="text-xs font-medium text-gray-600 dark:text-slate-300">{s.workUnit}</span>}
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.message}</p>
            </div>
            <button onClick={() => dismiss(s._id)} className="flex-shrink-0 p-1 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700/60 transition-colors" title="Ignorer">
              <X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlertsPanel;
