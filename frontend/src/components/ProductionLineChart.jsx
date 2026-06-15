// ProductionLineChart.jsx
// ─────────────────────────────────────────────────────────────────────────────
// RÔLE DU COMPOSANT
// Graphique en courbes de production, réutilisé sur plusieurs pages.
// Accepte deux formats d'entrée (brut ou pré-agrégé) et s'adapte
// automatiquement : une courbe par unité de travail, ou une courbe unique
// "Bonnes pièces" en fallback.

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// Palette de couleurs fixes, cyclée si plus de 7 unités
const LINE_COLORS = [
  "#4f46e5", "#16a34a", "#ea580c",
  "#0891b2", "#9333ea", "#db2777", "#ca8a04",
];

// ─────────────────────────────────────────────────────────────────────────────
// SOUS-COMPOSANT : infobulle personnalisée
// Affiche la date + une ligne par unité avec sa couleur et sa valeur.
// ─────────────────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          {/* Pastille de couleur de la série */}
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span className="text-gray-500 dark:text-slate-400">{p.dataKey} :</span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">
            {p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ProductionLineChart({ data = [], note, height = 240 }) {

  //   1. Format brut    → présence de la clé "workUnit" dans les records
  //                        → regroupement + sommation par (date, workUnit)
  
  // ───────────────────────────────────────────────────────────────────────────
  const { series, units } = useMemo(() => {
    if (!data.length) return { series: [], units: [] };

    // ── Cas 1 : données brutes (présence de la clé "workUnit") ──────────────
    const isRaw = "workUnit" in data[0];

    if (isRaw) {
      // Regroupement par date, cumul de goodQty par workUnit
      const byDate = {};
      data.forEach((r) => {
        if (!byDate[r.date]) byDate[r.date] = { date: r.date };
        byDate[r.date][r.workUnit] =
          (byDate[r.date][r.workUnit] || 0) + (r.goodQty || 0);
      });

      const series = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      const units  = [...new Set(data.map((r) => r.workUnit))].sort();
      return { series, units };
    }

    // ── Cas 2 & 3 : données déjà agrégées ───────────────────────────────────
    // On filtre les clés "connues" (métriques standards) pour isoler
    // d'éventuelles clés d'unités de travail injectées par l'appelant.
    const knownKeys = ["date", "goodQty", "defectsQty", "scrapQty", "productionTotal", "workSeconds"];
    const unitKeys  = Object.keys(data[0]).filter((k) => !knownKeys.includes(k));

    if (unitKeys.length > 0) {
      // Cas 2 : clés d'unités présentes → courbes multiples
      return { series: data, units: unitKeys };
    }

    // Cas 3 : fallback → courbe unique sur goodQty
    const series = data.map((r) => ({ date: r.date, "Bonnes pièces": r.goodQty ?? 0 }));
    return { series, units: ["Bonnes pièces"] };
  }, [data]);

  // État vide : aucune donnée après normalisation
  if (!series.length) {
    return (
      <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">
        Aucune donnée à afficher.
      </p>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={series} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />

          {/* Axe X : date formatée en "jj mmm" (fr-FR) */}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(d) =>
              new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
                day: "2-digit", month: "short",
              })
            }
            interval="preserveStartEnd"
          />

          {/* Axe Y : quantités brutes */}
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />

          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(v) => <span style={{ color: "#6b7280" }}>{v}</span>}
          />

          {/* Une courbe par unité, couleur cyclée depuis LINE_COLORS */}
          {units.map((unit, i) => (
            <Line
              key={unit}
              type="monotone"
              dataKey={unit}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}         // Points masqués pour lisibilité sur longues séries
              activeDot={{ r: 4 }} // Point visible au survol uniquement
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Note contextuelle optionnelle (ex. "Données provisoires") */}
      {note && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-2 italic">
          {note}
        </p>
      )}
    </div>
  );
}