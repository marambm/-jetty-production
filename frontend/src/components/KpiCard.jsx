import { TrendingUp, TrendingDown } from "lucide-react";
import Sparkline from "./Sparkline";

function KpiCard({ title, value, subtitle, icon: Icon, color = "indigo", delta, sparkData, invertDelta = false }) {
  const colors = {
    indigo: { chip: "text-indigo-600 bg-indigo-50 border-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-800", spark: "#4f46e5" },
    green:  { chip: "text-green-600 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800",   spark: "#16a34a" },
    red:    { chip: "text-red-600 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800",               spark: "#dc2626" },
    orange: { chip: "text-orange-600 bg-orange-50 border-orange-100 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800", spark: "#ea580c" },
  };

  const accent  = colors[color] || colors.indigo;
  const deltaUp = delta != null && delta >= 0;

  // Pour les pertes : une hausse (deltaUp=true) est MAUVAISE → rouge
  // Pour la production/rendement : une hausse est bonne → vert
  const isGood = invertDelta ? !deltaUp : deltaUp;

  const numericValue = typeof value === "string"
    ? parseFloat(value.replace("%", ""))
    : value;

  const prevValue = (delta != null && numericValue != null)
    ? numericValue - delta
    : null;

  const deltaPct = (prevValue != null && prevValue !== 0)
    ? ((delta / Math.abs(prevValue)) * 100).toFixed(1)
    : null;

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-5 flex flex-col gap-3"
      data-testid={`card-kpi-${title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 border ${accent.chip}`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={accent.spark} width={72} height={24} />
        )}
      </div>

      <div className="min-w-0">
        <p
          className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1"
          data-testid={`text-kpi-label-${title}`}
        >
          {title}
        </p>

        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className="text-2xl font-bold text-gray-900 dark:text-slate-100 tracking-tight"
            data-testid={`text-kpi-value-${title}`}
          >
            {value != null ? (typeof value === "number" ? value.toLocaleString() : value) : "—"}
          </p>

          {delta != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full
                ${isGood
                  ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30"
                  : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/30"}`}
              data-testid={`text-kpi-delta-${title}`}
            >
              {deltaUp
                ? <TrendingUp  className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />}
              {deltaUp ? "+" : ""}{typeof delta === "number" ? delta.toLocaleString() : delta}
              {deltaPct != null && (
                <span className="ml-0.5 opacity-75">
                  ({deltaUp ? "+" : ""}{deltaPct}%)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Légende "vs hier" — grande et colorée selon bon/mauvais */}
        {delta != null && (
          <p className={`text-sm font-semibold mt-1 ${isGood ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
            vs. {deltaUp ? "↑" : "↓"} hier
          </p>
        )}

        {subtitle && (
          <p
            className="text-sm font-semibold text-gray-600 dark:text-slate-300 mt-1"
            data-testid={`text-kpi-subtitle-${title}`}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export default KpiCard;