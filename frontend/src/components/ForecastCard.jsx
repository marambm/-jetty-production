
// RÔLE DU COMPOSANT
// Carte de prévision de production pour le lendemain.
// Affiche la valeur prédite (yhat), l'intervalle de confiance, le score de
// fiabilité du modèle, et un delta vs la production du jour actuel.
//


import { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, CalendarDays, Zap } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

function ForecastCard({ forecast, todayProduction }) {
  // Contrôle l'affichage du bloc d'explication dépliable
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  // Rendu nul si aucune prévision disponible
  if (!forecast) return null;

  const { forecastForDate, yhat, yhatLower, yhatUpper, confidence } = forecast;

  // Confiance affichée en % arrondi à l'entier, ou "--" si absente
  const pct = confidence != null ? (confidence * 100).toFixed(0) : "--";

  // Tendance : vrai si la prévision est >= production actuelle
  const trendUp = yhat >= (todayProduction || 0);

  // ───────────────────────────────────────────────────────────────────────────
  // DELTA DEMAIN VS AUJOURD'HUI
  // tomorrowDelta    : différence absolue (yhat − todayProduction)
  // tomorrowDeltaPct : différence en %, null si todayProduction vaut 0
  //                    (évite la division par zéro)
  // ───────────────────────────────────────────────────────────────────────────
  const tomorrowDelta    = yhat != null && todayProduction != null ? yhat - todayProduction : null;
  const tomorrowDeltaPct = tomorrowDelta != null && todayProduction > 0
    ? ((tomorrowDelta / todayProduction) * 100).toFixed(1)
    : null;

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-6"
      data-testid="section-forecast"
    >

      {/* ── En-tête : titre + indicateur de tendance ──────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("forecast.title")}</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {t("forecast.predictionFor")} {forecastForDate}
          </p>
        </div>

        {/* Icône + libellé de tendance (vert hausse / rouge baisse) */}
        <div className="flex items-center gap-1.5">
          {trendUp
            ? <TrendingUp  className="w-4 h-4 text-green-500" data-testid="icon-trend-up" />
            : <TrendingDown className="w-4 h-4 text-red-500"   data-testid="icon-trend-down" />}
          <span className={`text-sm font-medium ${trendUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {trendUp ? t("forecast.up") : t("forecast.down")}
          </span>
        </div>
      </div>

      {/* ── Bloc principal "Production attendue demain" ────────────────────── */}
      {/* Fond dégradé indigo, affiche yhat + delta vs aujourd'hui          */}
      <div className="mb-5 rounded-xl border border-indigo-100 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-900/20 dark:to-slate-900 p-4 flex flex-wrap items-center gap-4">

        {/* Icône calendrier + valeur prédite */}
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-none mb-1">
              Production attendue demain
            </p>
            <p
              className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 tracking-tight leading-none"
              data-testid="text-forecast-tomorrow"
            >
              {yhat != null ? yhat.toLocaleString() : "—"}
              <span className="text-sm font-normal text-gray-400 dark:text-slate-500 ml-1">unités</span>
            </p>
          </div>
        </div>

        {/* Badge delta (masqué si tomorrowDelta non calculable) */}
        {tomorrowDelta != null && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Zap className={`w-3.5 h-3.5 ${trendUp ? "text-green-500" : "text-red-500"}`} />
            <span
              className={`text-sm font-semibold px-2 py-1 rounded-full
                ${trendUp
                  ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30"
                  : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/30"}`}
              data-testid="text-forecast-tomorrow-delta"
            >
              {trendUp ? "+" : ""}{tomorrowDelta.toLocaleString()}
              {/* Pourcentage masqué si todayProduction vaut 0 */}
              {tomorrowDeltaPct != null && (
                <span className="ml-1 opacity-75 font-normal">
                  ({trendUp ? "+" : ""}{tomorrowDeltaPct}%)
                </span>
              )}
            </span>
            <span className="text-xs text-gray-400 dark:text-slate-500">vs aujourd'hui</span>
          </div>
        )}
      </div>

      {/* ── Métriques détaillées : valeur prévue · intervalle · confiance ─── */}
      <div className="flex flex-wrap gap-8" data-testid="card-forecast">

        {/* yhat — valeur centrale prédite */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t("forecast.expected")}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight" data-testid="text-forecast-yhat">
            {yhat != null ? yhat.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{t("forecast.units")}</p>
        </div>

        {/* yhatLower – yhatUpper : fourchette de l'intervalle de confiance */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t("forecast.range")}</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-slate-300" data-testid="text-forecast-range">
            {yhatLower?.toLocaleString()} &ndash; {yhatUpper?.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{t("forecast.rangeSub")}</p>
        </div>

        {/* Score de confiance coloré selon les seuils : ≥80% vert, ≥50% orange, <50% rouge */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t("forecast.confidence")}</p>
          <p
            className={`text-lg font-semibold ${
              confidence >= 0.8 ? "text-green-600 dark:text-green-400"
              : confidence >= 0.5 ? "text-orange-600 dark:text-orange-400"
              : "text-red-600 dark:text-red-400"
            }`}
            data-testid="text-forecast-confidence"
          >
            {pct}%
          </p>
        </div>
      </div>

      {/* ── Section dépliable : explication pédagogique du modèle ─────────── */}
      <div className="mt-5 border-t border-gray-100 dark:border-slate-800 pt-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          data-testid="button-forecast-explain"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {t("forecast.explain")}
        </button>

        {/* Contenu affiché seulement quand expanded === true */}
        {expanded && (
          <div
            className="mt-3 text-sm text-gray-600 dark:text-slate-400 leading-relaxed space-y-2"
            data-testid="text-forecast-explanation"
          >
            {/* Explication 1 : source des données du modèle */}
            <p>
              La <strong>production prévue</strong> est une estimation basée sur les données historiques
              des 30 derniers jours. Le modèle analyse les tendances et la saisonnalité pour prédire
              la production de demain.
            </p>
            {/* Explication 2 : lecture de l'intervalle */}
            <p>
              L'<strong>intervalle de confiance</strong> indique la fourchette dans laquelle la
              production réelle devrait se situer. Plus l'intervalle est étroit, plus la prédiction
              est précise.
            </p>
            {/* Explication 3 : interprétation des seuils de confiance */}
            <p>
              Le <strong>pourcentage de confiance</strong> mesure la fiabilité du modèle : au-dessus
              de 80% c'est fiable, entre 50-80% c'est modéré, en dessous de 50% les données sont
              insuffisantes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ForecastCard;