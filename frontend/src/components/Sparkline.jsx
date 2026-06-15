// Sparkline.jsx
// ─────────────────────────────────────────────────────────────────────────────
// RÔLE DU COMPOSANT
// Mini-graphique en courbe (sparkline) affiché dans les KpiCards.
// Trace une polyline SVG normalisée entre 0 et la hauteur disponible,
// sans axes ni étiquettes — uniquement la tendance visuelle.
//
// PROPS
//   data   {number[]|object[]}  Points à tracer.
//                               Accepte un tableau de nombres OU d'objets
//                               avec une clé "productionTotal".
//   width  {number}             Largeur du SVG en px (défaut : 80)
//   height {number}             Hauteur du SVG en px (défaut : 28)
//   color  {string}             Couleur hex du trait (défaut : "#4f46e5")
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, width = 80, height = 28, color = "#4f46e5" }) {

  // Rendu nul si moins de 2 points (impossible de tracer une courbe)
  if (!data || data.length < 2) return null;

  // Normalisation : accepte des nombres bruts ou des objets { productionTotal }
  const values = data.map((d) => (typeof d === "number" ? d : d.productionTotal || 0));

  // Bornes de la plage de valeurs
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  // range vaut au moins 1 pour éviter une division par zéro si toutes les
  // valeurs sont identiques (courbe plate au centre)
  const range = max - min || 1;

  // Calcul des coordonnées SVG
  // x : réparti uniformément sur toute la largeur
  // y : inversé (SVG part du haut) avec 2px de marge en haut et en bas
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block" data-testid="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Sparkline;