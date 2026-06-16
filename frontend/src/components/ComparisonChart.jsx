// ComparisonChart.jsx
// ─────────────────────────────────────────────────────────────────────────────
// RÔLE DU COMPOSANT
// Affiche un graphique en barres côte à côte comparant deux périodes de
// production : la "période actuelle" (se terminant à `date`) et la "période
// précédente" (la plage identique juste avant).
//
// PROPS
//   date      {string}  Date de fin de la période actuelle (format YYYY-MM-DD)
//   rangeLen  {number}  Nombre de jours par période (défaut : 7)
//   workUnit  {string}  Filtre optionnel par unité de travail ("All" = pas de filtre)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { ArrowLeftRight, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fetchProduction } from "../api/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// Couleurs fixes pour les deux séries du graphique
const COLOR_CURRENT  = "#4f46e5"; // Indigo — période actuelle
const COLOR_PREVIOUS = "#c7d2fe"; // Indigo clair — période précédente

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRE : calcule { from, to, fromLabel, toLabel } pour une plage de
// `days` jours se terminant à `refDate` (inclus).
// ─────────────────────────────────────────────────────────────────────────────
function getDateRange(refDate, days) {
  const to   = new Date(refDate + "T00:00:00");
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return {
    from: from.toISOString().split("T")[0],
    to:   to.toISOString().split("T")[0],
    fromLabel: from.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    toLabel:   to.toLocaleDateString("fr-FR",   { day: "2-digit", month: "short" }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRE : regroupe un tableau de records par date et somme les goodQty.
// Retourne un objet { "YYYY-MM-DD": totalPièces, … }
// ─────────────────────────────────────────────────────────────────────────────
function aggregateByDate(records) {
  const map = {};
  records.forEach((r) => {
    if (!map[r.date]) map[r.date] = 0;
    map[r.date] += r.goodQty || 0;
  });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────

// Reçoit les props standard de Recharts (active, payload, label).
// Affiche les valeurs des deux périodes + la différence colorée.
// ─────────────────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const cur  = payload.find((p) => p.dataKey === "Période actuelle");
  const prev = payload.find((p) => p.dataKey === "Période précédente");
  const diff = cur && prev ? cur.value - prev.value : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">Jour {label}</p>

      {/* Ligne période actuelle */}
      {cur && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_CURRENT, display: "inline-block" }} />
            <span className="text-gray-500 dark:text-slate-400">Actuelle</span>
          </span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">{cur.value?.toLocaleString()} pcs</span>
        </div>
      )}

      {/* Ligne période précédente */}
      {prev && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_PREVIOUS, display: "inline-block" }} />
            <span className="text-gray-500 dark:text-slate-400">Précédente</span>
          </span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">{prev.value?.toLocaleString()} pcs</span>
        </div>
      )}

      {/* Différence colorée : vert si hausse, rouge si baisse, gris si stable */}
      {diff != null && (
        <div className={`mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 font-semibold text-center
          ${diff > 0 ? "text-green-600 dark:text-green-400" : diff < 0 ? "text-red-500 dark:text-red-400" : "text-gray-400"}`}>
          {diff > 0 ? "+" : ""}{diff.toLocaleString()} pcs {diff > 0 ? "↑" : diff < 0 ? "↓" : "="}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ComparisonChart({ date, rangeLen = 7, workUnit }) {

  // series  : tableau de points { day, "Période actuelle", "Période précédente" }
  // loading : indique si un fetch est en cours
  // ranges  : labels des deux périodes (pour les badges)
  // totals  : somme totale de chaque période (pour le résumé)
  const [series,  setSeries]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [ranges,  setRanges]  = useState({ current: null, previous: null });
  const [totals,  setTotals]  = useState({ current: 0, previous: 0 });

  // ───────────────────────────────────────────────────────────────────────────
  // CHARGEMENT DES DONNÉES
  // Calcule les deux plages de dates, lance les deux fetches en parallèle,
  // puis construit le tableau `series` en alignant jour par jour.
  // ───────────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Période actuelle : se termine à `date`, dure `rangeLen` jours
      const current  = getDateRange(date, rangeLen);

      // Période précédente : se termine la veille du début de la période actuelle
      const prevTo   = new Date(current.from + "T00:00:00");
      prevTo.setDate(prevTo.getDate() - 1);
      const previous = getDateRange(prevTo.toISOString().split("T")[0], rangeLen);

      setRanges({ current, previous });

      // Construction des paramètres communs aux deux requêtes
      const params = (range) => ({
        from: range.from, to: range.to, limit: 2000, skip: 0,
        ...(workUnit && workUnit !== "All" ? { workUnit } : {}),
      });

      // Requêtes parallèles pour réduire la latence
      const [curRes, prevRes] = await Promise.all([
        fetchProduction(params(current)),
        fetchProduction(params(previous)),
      ]);

      // Agrégation par date → { "YYYY-MM-DD": total }
      const curMap  = aggregateByDate(curRes.records  || []);
      const prevMap = aggregateByDate(prevRes.records || []);

      const curDates  = Object.keys(curMap).sort();
      const prevDates = Object.keys(prevMap).sort();

      // On prend le maximum pour ne pas tronquer la série la plus longue
      const maxLen = Math.max(curDates.length, prevDates.length, rangeLen);

      // Alignement jour par jour (index i = jour i+1)
      // Si une période n'a pas de donnée pour ce jour → 0
      const data = Array.from({ length: maxLen }, (_, i) => ({
        day:                  i + 1,
        "Période actuelle":   curMap[curDates[i]]  ?? 0,
        "Période précédente": prevMap[prevDates[i]] ?? 0,
      }));

      // Calcul des totaux pour le résumé en langage naturel
      setTotals({
        current:  Object.values(curMap).reduce((s, v) => s + v, 0),
        previous: Object.values(prevMap).reduce((s, v) => s + v, 0),
      });
      setSeries(data);

    } catch (err) {
      console.error("Comparison load error:", err);
      // Pas de state d'erreur dédié : le composant reste dans son dernier état valide
    } finally {
      setLoading(false);
    }
  }, [date, rangeLen, workUnit]);

  // Recharge à chaque changement de props
  useEffect(() => { load(); }, [load]);

  // ───────────────────────────────────────────────────────────────────────────
  // CALCUL DE LA TENDANCE
  // diff    : différence absolue (actuelle − précédente)
  // diffPct : différence en % par rapport à la période précédente
  // trend   : "up" | "down" | "stable" — pilote la couleur et l'icône
  // ───────────────────────────────────────────────────────────────────────────
  const diff    = totals.current - totals.previous;
  const diffPct = totals.previous > 0 ? ((diff / totals.previous) * 100).toFixed(1) : null;
  const trend   = diff > 0 ? "up" : diff < 0 ? "down" : "stable";

  // Résumé en langage naturel affiché dans la bannière de tendance
  const summaryText = (() => {
    if (totals.previous === 0) return "Pas de données pour la période précédente.";
    if (trend === "up")   return `Production en hausse : +${Math.abs(diff).toLocaleString()} pièces (+${diffPct}%) par rapport à la période précédente. 👍`;
    if (trend === "down") return `Production en baisse : −${Math.abs(diff).toLocaleString()} pièces (${diffPct}%) par rapport à la période précédente. ⚠️`;
    return "Production stable par rapport à la période précédente.";
  })();

  // Icône et classes de couleur selon la tendance
  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up"
    ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
    : trend === "down"
    ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
    : "text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700";

  // ───────────────────────────────────────────────────────────────────────────
  // RENDU
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">

      {/* ── En-tête : titre + spinner de chargement ───────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-indigo-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            Comparaison de production — période actuelle vs précédente
          </h2>
          {loading && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin ml-auto" />}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 ml-6">
          Chaque barre représente les bonnes pièces produites sur un jour. Comparez facilement si la production s'améliore ou se dégrade.
        </p>
      </div>

      {/* ── Badges des deux périodes avec leurs totaux ────────────────────── */}
      {ranges.current && (
        <div className="flex flex-wrap gap-3">

          {/* Badge période actuelle (indigo) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_CURRENT, display: "inline-block", flexShrink: 0 }} />
            <div>
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium uppercase tracking-wide">Période actuelle</p>
              <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                {ranges.current.fromLabel} → {ranges.current.toLabel}
                <span className="ml-2 text-indigo-600 dark:text-indigo-300">({totals.current.toLocaleString()} pcs)</span>
              </p>
            </div>
          </div>

          {/* Badge période précédente (gris) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_PREVIOUS, display: "inline-block", flexShrink: 0 }} />
            <div>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wide">Période précédente</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                {ranges.previous.fromLabel} → {ranges.previous.toLabel}
                <span className="ml-2 text-gray-500 dark:text-slate-400">({totals.previous.toLocaleString()} pcs)</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Bannière de tendance (masquée pendant le chargement ou sans données précédentes) */}
      {!loading && totals.previous > 0 && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${trendColor}`}>
          <TrendIcon className="w-4 h-4 shrink-0" />
          <span>{summaryText}</span>
        </div>
      )}

      {/* ── Graphique en barres (Recharts) ────────────────────────────────── */}
      {!loading && series.length === 0 ? (
        // État vide : aucune donnée disponible
        <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">Aucune donnée disponible.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 4, right: 16, left: -8, bottom: 0 }} barGap={3} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />
            {/* Axe X : numéro du jour (1, 2, …) */}
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(v) => `Jour ${v}`}
            />
            {/* Axe Y : quantité de pièces */}
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v) => v.toLocaleString()} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: "#6b7280" }}>{v}</span>}
            />
            {/* Barres côte à côte, coins supérieurs arrondis */}
            <Bar dataKey="Période actuelle"   fill={COLOR_CURRENT}  radius={[4, 4, 0, 0]} />
            <Bar dataKey="Période précédente" fill={COLOR_PREVIOUS} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* ── Aide à la lecture ─────────────────────────────────────────────── */}
      <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
        💡 Survolez une barre pour voir le détail du jour. Plus la barre bleue est haute, plus la production de la période actuelle est bonne.
      </p>
    </div>
  );
}