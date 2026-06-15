

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { useI18n } from "../i18n/I18nProvider";

const C = {
  bg:      "#f9fafb",
  panel:   "#ffffff",
  card:    "#ffffff",
  border:  "#e5e7eb",
  accent:  "#6366f1",
  gold:    "#f59e0b",
  silver:  "#9ca3af",
  bronze:  "#d97706",
  green:   "#22c55e",
  red:     "#ef4444",
  blue:    "#3b82f6",
  text:    "#111827",
  muted:   "#6b7280",
  dim:     "#9ca3af",
};

const MEDALS = ["🥇", "🥈", "🥉"];

const DEPT_PALETTE = [
  "#e8a020", "#4d9de0", "#34c472", "#8a9bb0",
  "#e85d7a", "#9b59b6", "#1abc9c", "#e67e22",
];

function getDeptColor(dept, deptList) {
  const idx = deptList.indexOf(dept);
  return DEPT_PALETTE[idx % DEPT_PALETTE.length] || C.dim;
}

// Traduction manuelle des noms de départements fixes
function translateDeptName(dept, lang) {
  if (lang === 'zh') {
    const map = {
      "Contrôle qualité": "质量控制",
      "Emballage": "包装",
      "Insertion connecteurs": "连接器插入"
    };
    return map[dept] || dept;
  }
  if (lang === 'en') {
    const map = {
      "Contrôle qualité": "Quality Control",
      "Emballage": "Packaging",
      "Insertion connecteurs": "Connector Insertion"
    };
    return map[dept] || dept;
  }
  return dept; // français ou autre
}

function Chip({ label, color = C.dim }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 4,
      background: `${color}18`, border: `1px solid ${color}40`,
      color, fontSize: 10, fontFamily: "monospace", letterSpacing: 0.5,
    }}>
      {label}
    </span>
  );
}

function ScoreBar({ value, color = C.accent }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height: 5, overflow: "hidden", width: "100%" }}>
      <div style={{
        width: `${Math.min(value, 100)}%`, height: "100%", borderRadius: 99,
        background: `linear-gradient(90deg, ${color}80, ${color})`,
        transition: "width 0.9s cubic-bezier(.34,1.56,.64,1)",
      }} />
    </div>
  );
}

function KpiBox({ icon, label, value, unit, color = C.text }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>
        {value}{unit && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

function TooltipBar({ active, payload }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: C.text }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: C.accent }}>{d?.employeeName}</div>
      <div style={{ color: C.green }}>{t('leaderboard.okLabel', { value: d?.goodQty })}</div>
      <div style={{ color: C.red }}>{t('leaderboard.defectsLabel', { value: d?.defectsQty })}</div>
      <div style={{ color: C.muted }}>{t('leaderboard.scrapLabel', { value: d?.scrapQty })}</div>
      <div style={{ marginTop: 6, color: C.accent }}>{t('leaderboard.scoreLabel', { value: d?.score })}</div>
    </div>
  );
}

function RankEvoBadge({ delta }) {
  if (delta == null) return null;
  if (delta > 0)
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>
        ▲ +{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: C.red, background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>
        ▼ {delta}
      </span>
    );
  return (
    <span style={{ fontSize: 10, color: C.muted, background: "#f3f4f6", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>
      → =
    </span>
  );
}

function StreakBadge({ streak, t }) {
  if (!streak || streak < 3) return null;
  return (
    <span title={t('leaderboard.streakTitle', { streak })} style={{ fontSize: 13, cursor: "default" }}>
      🔥
    </span>
  );
}

export default function EmployeeLeaderboard() {
  const { t, lang } = useI18n(); // Récupère aussi la langue

  const [viewMode,    setViewMode]    = useState("week");
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const [employees,     setEmployees]     = useState([]);
  const [weekStart,     setWeekStart]     = useState("");
  const [weekEnd,       setWeekEnd]       = useState("");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [prevEmployees, setPrevEmployees] = useState([]);
  const [streakMap,     setStreakMap]     = useState({});

  const [expanded,   setExpanded]   = useState(null);
  const [tab,        setTab]        = useState("rank");
  const [search,     setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const [deptList, setDeptList] = useState([]);
  const [deptsLoading, setDeptsLoading] = useState(true);

  useEffect(() => {
    async function loadDepartments() {
      setDeptsLoading(true);
      try {
        const res  = await fetch("/api/departments");
        const data = await res.json();
        if (data.ok && Array.isArray(data.departments)) {
          setDeptList(data.departments);
          return;
        }
      } catch {}
      try {
        const res  = await fetch(`/api/employee-performance/weekly?week=0`);
        const data = await res.json();
        if (data.ok && data.employees?.length) {
          const uniqueDepts = [...new Set(data.employees.map(e => e.department).filter(Boolean))].sort();
          setDeptList(uniqueDepts);
        }
      } catch {
        setDeptList([]);
      } finally {
        setDeptsLoading(false);
      }
    }
    loadDepartments();
  }, []);

  useEffect(() => {
    if (employees.length && deptList.length === 0) {
      const uniqueDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
      setDeptList(uniqueDepts);
    }
  }, [employees, deptList.length]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = viewMode === "month"
        ? `/api/employee-performance/monthly?month=${monthOffset}`
        : `/api/employee-performance/weekly?week=${weekOffset}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Erreur API");
      setEmployees(data.employees || []);
      setWeekStart(data.weekStart || data.monthStart || "");
      setWeekEnd(data.weekEnd   || data.monthEnd   || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekOffset, monthOffset, viewMode]);

  const loadPrevRanks = useCallback(async () => {
    if (viewMode !== "week") { setPrevEmployees([]); return; }
    try {
      const res  = await fetch(`/api/employee-performance/weekly?week=${weekOffset + 1}`);
      const data = await res.json();
      if (data.ok) setPrevEmployees(data.employees || []);
    } catch {
      setPrevEmployees([]);
    }
  }, [weekOffset, viewMode]);

  const loadStreaks = useCallback(async () => {
    if (viewMode !== "week" || !employees.length) { setStreakMap({}); return; }
    try {
      const weeks = await Promise.all([1, 2, 3].map(async (off) => {
        const res  = await fetch(`/api/employee-performance/weekly?week=${weekOffset + off}`);
        const data = await res.json();
        return data.ok ? data.employees || [] : [];
      }));
      const rankOf = (list, id) => list.findIndex(e => e.employeeId === id);
      const streaks = {};
      for (const emp of employees) {
        const id = emp.employeeId;
        const ranks = [
          employees.findIndex(e => e.employeeId === id),
          rankOf(weeks[0], id),
          rankOf(weeks[1], id),
          rankOf(weeks[2], id),
        ];
        let streak = 0;
        for (let i = 0; i < ranks.length - 1; i++) {
          if (ranks[i] !== -1 && ranks[i + 1] !== -1 && ranks[i] < ranks[i + 1]) streak++;
          else break;
        }
        streaks[id] = streak;
      }
      setStreakMap(streaks);
    } catch {
      setStreakMap({});
    }
  }, [weekOffset, viewMode, employees]);

  useEffect(() => { loadData(); },      [loadData]);
  useEffect(() => { loadPrevRanks(); }, [loadPrevRanks]);
  useEffect(() => { if (employees.length) loadStreaks(); }, [loadStreaks]);

  const rankDeltaMap = useMemo(() => {
    if (!prevEmployees.length) return {};
    const map = {};
    employees.forEach((emp, currentRank) => {
      const prevRank = prevEmployees.findIndex(e => e.employeeId === emp.employeeId);
      if (prevRank === -1) { map[emp.employeeId] = null; return; }
      map[emp.employeeId] = prevRank - currentRank;
    });
    return map;
  }, [employees, prevEmployees]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (search.trim())
      list = list.filter(emp =>
        emp.employeeName.toLowerCase().includes(search.trim().toLowerCase())
      );
    if (deptFilter !== "all")
      list = list.filter(emp => emp.department === deptFilter);
    return list;
  }, [employees, search, deptFilter]);

  const offset    = viewMode === "month" ? monthOffset : weekOffset;
  const setOffset = viewMode === "month" ? setMonthOffset : setWeekOffset;

  let periodLabel = "";
  if (viewMode === "month") {
    if (monthOffset === 0) periodLabel = t('leaderboard.thisMonth');
    else if (monthOffset === 1) periodLabel = t('leaderboard.lastMonth');
    else periodLabel = t('leaderboard.monthsAgo', { count: monthOffset });
  } else {
    if (weekOffset === 0) periodLabel = t('leaderboard.thisWeek');
    else if (weekOffset === 1) periodLabel = t('leaderboard.lastWeek');
    else periodLabel = t('leaderboard.weeksAgo', { count: weekOffset });
  }

  const fmtDate = (s) => s
    ? new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    : "";

  const top = employees[0];

  const pageStyle  = { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "28px 20px", maxWidth: 860, margin: "0 auto" };
  const btnOutline = { background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 12 };

  if (loading) return (
    <div style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center", color: C.muted, fontFamily: "monospace" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚙️</div>{t('leaderboard.loading')}
      </div>
    </div>
  );

  if (error) return (
    <div style={{ ...pageStyle, padding: 32, color: C.red, fontFamily: "monospace" }}>
      ❌ {error}
      <button onClick={loadData} style={{ ...btnOutline, marginLeft: 16 }}>{t('leaderboard.retry')}</button>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: -1, color: C.text }}>
          {t('leaderboard.title')}
        </h1>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => { setViewMode("week"); setWeekOffset(0); setMonthOffset(0); }}
          style={{ background: C.accent, border: `1px solid ${C.accent}`, color: "#fff", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700, transition: "all .2s" }}
        >
          📅 {t('leaderboard.weekButton')}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 18px", marginBottom: 20, gap: 12 }}>
        <button onClick={() => setOffset(o => o + 1)} style={btnOutline}>{t('leaderboard.previous')}</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{periodLabel}</div>
          {weekStart && (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>
              {fmtDate(weekStart)} → {fmtDate(weekEnd)}
            </div>
          )}
        </div>
        <button
          onClick={() => setOffset(o => Math.max(0, o - 1))}
          disabled={offset === 0}
          style={{ ...btnOutline, opacity: offset === 0 ? 0.25 : 1 }}
        >
          {t('leaderboard.next')}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, marginRight: 4 }}>
          {t('leaderboard.deptLabel')}
        </span>
        {deptsLoading ? (
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{t('leaderboard.loading')}</span>
        ) : (
          [{ key: "all", label: t('leaderboard.deptAll') }, ...deptList.map(d => ({ key: d, label: translateDeptName(d, lang) }))].map(({ key, label }) => {
            const active = deptFilter === key;
            const dColor = key === "all" ? C.accent : getDeptColor(key, deptList);
            return (
              <button
                key={key}
                onClick={() => setDeptFilter(key)}
                style={{
                  padding: "5px 13px", borderRadius: 20, fontSize: 11,
                  fontFamily: "monospace", cursor: "pointer",
                  fontWeight: active ? 700 : 400,
                  background: active ? `${dColor}18` : "transparent",
                  border: `1px solid ${active ? dColor : C.border}`,
                  color: active ? dColor : C.muted,
                  transition: "all .15s",
                }}
              >
                {label}
              </button>
            );
          })
        )}
      </div>

      {employees.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontFamily: "monospace" }}>
          {t('leaderboard.noDataPeriod')}
        </div>
      ) : (
        <>
          {top && (
            <div style={{ background: "linear-gradient(135deg, #d7d6e6 0%, #26426a 60%)", border: `1px solid ${C.gold}50`, borderRadius: 14, padding: "22px 26px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: "50%", background: `${C.gold}06`, border: `1px solid ${C.gold}15`, pointerEvents: "none" }} />
              <div style={{ fontSize: 10, color: C.gold, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                🏆 {t('leaderboard.bestEmployee', { period: periodLabel })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.gold}20`, border: `3px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: C.gold, fontFamily: "monospace", flexShrink: 0 }}>
                  {top.employeeName.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{top.employeeName}</div>
                    <StreakBadge streak={streakMap[top.employeeId]} t={t} />
                  </div>
                  <Chip label={translateDeptName(top.department, lang)} color={getDeptColor(top.department, deptList)} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 42, fontWeight: 900, color: C.gold, fontFamily: "monospace", lineHeight: 1 }}>{top.score}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{t('leaderboard.scorePoints')}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <KpiBox icon="✓" label={t('leaderboard.goodQty')} value={top.goodQty}      unit={t('leaderboard.unitPcs')} color={C.green}  />
                <KpiBox icon="◎" label={t('leaderboard.quality')}   value={top.qualityRate}  unit={t('leaderboard.unitPercent')} color={C.accent} />
                <KpiBox icon="⚡" label={t('leaderboard.productivityPerDay')} value={top.productivity} unit={t('leaderboard.unitPerDay')} color={C.blue}   />
                <KpiBox icon="⏱" label={t('leaderboard.efficiency')} value={top.efficiency}   unit={t('leaderboard.unitPercent')} color={C.dim}    />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[["rank", `📋 ${t('leaderboard.tabRanking')}`], ["chart", `📊 ${t('leaderboard.tabChart')}`]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  background: tab === id ? C.accent : "transparent",
                  border: `1px solid ${tab === id ? C.accent : C.border}`,
                  color: tab === id ? "#fff" : C.muted,
                  borderRadius: 8, padding: "7px 18px", cursor: "pointer",
                  fontFamily: "monospace", fontSize: 12, fontWeight: 700, transition: "all .2s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.dim, fontSize: 14, pointerEvents: "none" }}>🔍</span>
            <input
              type="text"
              placeholder={t('leaderboard.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px 10px 36px", fontFamily: "monospace", fontSize: 13, color: C.text, outline: "none", transition: "border-color .2s" }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e  => e.target.style.borderColor = C.border}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 16, lineHeight: 1 }}
              >×</button>
            )}
          </div>

          {tab === "rank" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredEmployees.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, color: C.muted, fontFamily: "monospace", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 11 }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
                  {t('leaderboard.noResultFor', { search: search || deptFilter })}
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const realIndex = employees.findIndex(e => e.employeeId === emp.employeeId);
                  const isOpen    = expanded === emp.employeeId;
                  const rankColor = realIndex === 0 ? C.gold : realIndex === 1 ? C.silver : realIndex === 2 ? C.bronze : C.muted;
                  const delta     = rankDeltaMap[emp.employeeId];
                  const streak    = streakMap[emp.employeeId] || 0;

                  return (
                    <div
                      key={emp.employeeId}
                      onClick={() => setExpanded(isOpen ? null : emp.employeeId)}
                      style={{ background: isOpen ? `${C.accent}09` : C.card, border: `1px solid ${isOpen ? C.accent + "50" : C.border}`, borderRadius: 11, padding: "14px 18px", cursor: "pointer", transition: "all .2s" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 32, textAlign: "center", fontSize: realIndex < 3 ? 20 : 12, color: rankColor, fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>
                          {realIndex < 3 ? MEDALS[realIndex] : `#${realIndex + 1}`}
                        </div>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${rankColor}18`, border: `2px solid ${rankColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: rankColor, fontFamily: "monospace", flexShrink: 0 }}>
                          {emp.employeeName.split(" ").map(w => w[0]).join("").slice(0, 2)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, flexWrap: "wrap", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{emp.employeeName}</span>
                              <StreakBadge streak={streak} t={t} />
                              <Chip label={translateDeptName(emp.department, lang)} color={getDeptColor(emp.department, deptList)} />
                              <RankEvoBadge delta={delta} />
                            </div>
                            <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 17, color: rankColor }}>{emp.score}</span>
                          </div>
                          <ScoreBar value={emp.score} color={rankColor} />
                        </div>
                      </div>

                      {isOpen && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${C.border}`, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                          {[
                            { icon: "✓",  label: t('leaderboard.detailsGoodQty'),   val: `${emp.goodQty} ${t('leaderboard.unitPcs')}`,      color: C.green  },
                            { icon: "✗",  label: t('leaderboard.detailsDefects'),    val: `${emp.defectsQty} ${t('leaderboard.unitPcs')}`,   color: C.red    },
                            { icon: "🗑", label: t('leaderboard.detailsScrap'),       val: `${emp.scrapQty} ${t('leaderboard.unitPcs')}`,     color: C.muted  },
                            { icon: "◎",  label: t('leaderboard.detailsQuality'),    val: `${emp.qualityRate}${t('leaderboard.unitPercent')}`, color: C.accent },
                            { icon: "⚡", label: t('leaderboard.detailsProductivity'),val: `${emp.productivity} ${t('leaderboard.unitPerDay')}`, color: C.blue   },
                            { icon: "⏱", label: t('leaderboard.detailsEfficiency'),  val: `${emp.efficiency}${t('leaderboard.unitPercent')}`,  color: C.dim    },
                            { icon: "📅", label: t('leaderboard.detailsDaysWorked'), val: `${emp.daysWorked} ${t('leaderboard.daysAbbr')}`,   color: C.text   },
                            { icon: "📦", label: t('leaderboard.detailsTotalPcs'),   val: `${emp.total} ${t('leaderboard.unitPcs')}`,        color: C.text   },
                          ].map(({ icon, label, val, color }) => (
                            <div key={label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                              <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 3 }}>{icon} {label}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "monospace" }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "chart" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>
                  {t('leaderboard.chartScoreTitle')}
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={filteredEmployees} margin={{ top: 4, right: 8, left: -12, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="employeeName" tick={{ fill: C.muted, fontSize: 10, fontFamily: "monospace" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: C.muted, fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip content={<TooltipBar />} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {filteredEmployees.map((e) => {
                        const realIndex = employees.findIndex(emp => emp.employeeId === e.employeeId);
                        return (
                          <Cell key={e.employeeId} fill={realIndex === 0 ? C.gold : realIndex === 1 ? C.silver : realIndex === 2 ? C.bronze : C.blue} opacity={0.88} />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>
                  {t('leaderboard.chartOkVsDefects')}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={filteredEmployees} margin={{ top: 4, right: 8, left: -12, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="employeeName" tick={{ fill: C.muted, fontSize: 10, fontFamily: "monospace" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                    <Tooltip content={<TooltipBar />} />
                    <Bar dataKey="goodQty"    stackId="s" fill={C.green} radius={[0,0,0,0]} />
                    <Bar dataKey="defectsQty" stackId="s" fill={C.red}   radius={[0,0,0,0]} />
                    <Bar dataKey="scrapQty"   stackId="s" fill={C.muted} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 36, textAlign: "center", fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
        {t('leaderboard.source')}
      </div>
    </div>
  );
}