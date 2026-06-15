/**
 * WeeklyHeatmap — Grille 7 jours × unités de travail
 * colorée par rendement (vert / orange / rouge)
 *
 * Props:
 *   series      — dashboard.series  [{date, byWorkUnit:[{workUnit,goodQty,productionTotal}]}]
 *   thresholds  — { rendementWarning:85, rendementCritical:70 }
 */
function WeeklyHeatmap({ series = [], thresholds = {} }) {
  const warnT    = thresholds.rendementWarning  ?? 85;
  const critT    = thresholds.rendementCritical ?? 70;

  // ── 7 derniers jours ──────────────────────────────────────────────────────
  const last7 = series.slice(-7);
  if (last7.length === 0) return null;

  // ── Collecter toutes les unités ───────────────────────────────────────────
  const unitSet = new Set();
  last7.forEach((day) => (day.byWorkUnit || []).forEach((w) => unitSet.add(w.workUnit)));
  const units = Array.from(unitSet).sort();
  if (units.length === 0) return null;

  // ── Formatage date court ──────────────────────────────────────────────────
  const fmtDay = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  };

  // ── Couleur selon rendement ───────────────────────────────────────────────
  const cellColor = (rate) => {
    if (rate == null) return { bg: "#f1f5f9", text: "#94a3b8", label: "—" };
    if (rate >= warnT)  return { bg: "#dcfce7", text: "#15803d", label: `${rate.toFixed(1)}%` };
    if (rate >= critT)  return { bg: "#ffedd5", text: "#c2410c", label: `${rate.toFixed(1)}%` };
    return                     { bg: "#fee2e2", text: "#b91c1c", label: `${rate.toFixed(1)}%` };
  };

  // dark-mode equivalent (inline style only — no Tailwind dark: needed)
  const isDark = typeof window !== "undefined"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;

  const cardBg   = isDark ? "#0f172a" : "#ffffff";
  const borderC  = isDark ? "#1e293b" : "#e5e7eb";
  const headerTx = isDark ? "#94a3b8" : "#6b7280";
  const unitTx   = isDark ? "#cbd5e1" : "#374151";

  const darkCell = (rate) => {
    if (rate == null) return { bg: "#1e293b", text: "#475569", label: "—" };
    if (rate >= warnT)  return { bg: "#14532d", text: "#4ade80", label: `${rate.toFixed(1)}%` };
    if (rate >= critT)  return { bg: "#7c2d12", text: "#fb923c", label: `${rate.toFixed(1)}%` };
    return                     { bg: "#7f1d1d", text: "#f87171", label: `${rate.toFixed(1)}%` };
  };

  const getCell = (rate) => isDark ? darkCell(rate) : cellColor(rate);

  return (
    <div
      style={{
        background: cardBg,
        border: `1px solid ${borderC}`,
        borderRadius: 16,
        padding: "20px 24px",
        overflowX: "auto",
      }}
      data-testid="section-heatmap"
    >
      {/* Titre */}
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: 14,
          fontWeight: 600,
          color: unitTx,
          letterSpacing: "-0.01em",
        }}
      >
        Heatmap rendement — 7 derniers jours
      </h2>

      {/* Légende */}
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { bg: "#dcfce7", text: "#15803d", label: `≥ ${warnT}% — OK` },
          { bg: "#ffedd5", text: "#c2410c", label: `${critT}–${warnT}% — Attention` },
          { bg: "#fee2e2", text: "#b91c1c", label: `< ${critT}% — Critique` },
          { bg: "#f1f5f9", text: "#94a3b8", label: "Pas de données" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: l.bg }} />
            <span style={{ fontSize: 11, color: headerTx }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <table style={{ borderCollapse: "separate", borderSpacing: "4px 4px", minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ width: 72, textAlign: "left", fontSize: 11, color: headerTx, fontWeight: 500, paddingBottom: 4 }}>
              Unité
            </th>
            {last7.map((day) => (
              <th
                key={day.date}
                style={{ textAlign: "center", fontSize: 11, color: headerTx, fontWeight: 500, paddingBottom: 4, minWidth: 64 }}
              >
                {fmtDay(day.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit}>
              <td
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: unitTx,
                  paddingRight: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {unit}
              </td>
              {last7.map((day) => {
                const wu   = (day.byWorkUnit || []).find((w) => w.workUnit === unit);
                const rate = wu && wu.productionTotal > 0
                  ? (wu.goodQty / wu.productionTotal) * 100
                  : null;
                const c = getCell(rate);
                return (
                  <td key={day.date} style={{ padding: 0, textAlign: "center" }}>
                    <div
                      title={`${unit} · ${day.date} · ${c.label}`}
                      style={{
                        background: c.bg,
                        color: c.text,
                        borderRadius: 8,
                        padding: "6px 4px",
                        fontSize: 11,
                        fontWeight: 700,
                        minWidth: 60,
                        transition: "opacity .15s",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    >
                      {c.label}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default WeeklyHeatmap;
