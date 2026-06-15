// ============================================================
// BLOC 1 — IMPORTS
// ============================================================
// Hooks React : gestion d'état, effets, mémorisation
import { useState, useEffect, useCallback, useMemo } from "react";

// Icônes Lucide utilisées dans l'interface
import {
  Factory,       // icône "usine" pour l'état vide
  Plus,          // bouton "Ajouter"
  Pencil,        // bouton "Modifier"
  Trash2,        // bouton "Supprimer"
  Loader2,       // spinner de chargement
  X,             // fermer la modale
  Search,        // champ de recherche
  TrendingUp,    // titre du graphique
  ChevronLeft,   // pagination : page précédente
  ChevronRight,  // pagination : page suivante
} from "lucide-react";

// Traductions (i18n) — fournit la fonction t("clé")
import { useI18n } from "../i18n/I18nProvider";

// Appels API vers le backend
import {
  fetchProduction,   // lire les enregistrements de production
  createProduction,  // créer un nouvel enregistrement
  updateProduction,  // modifier un enregistrement existant
  deleteProduction,  // supprimer un enregistrement
  fetchWorkUnits,    // récupérer la liste des unités de travail
} from "../api/client";

// Composants UI réutilisables
import CalendarPicker    from "../components/CalendarPicker";   // sélecteur de date
import WorkUnitCombobox  from "../components/WorkUnitCombobox"; // liste déroulante des unités
import FilterField       from "../components/FilterField";      // conteneur de filtre avec label
import { ui }            from "../components/uiStyles";         // classes Tailwind centralisées

// Composants du graphique (Recharts)
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";


// ============================================================
// BLOC 2 — CONSTANTES GLOBALES
// ============================================================

// Valeurs par défaut du formulaire d'ajout/édition
const EMPTY_FORM = {
  date: "",
  workUnit: "",
  goodQty: 0,
  defectsQty: 0,
  scrapQty: 0,
  workSeconds: 0,
  theoreticalSeconds: 0,
};

// Nombre de lignes affichées par page dans le tableau
const PAGE_SIZE = 20;

// Palette de couleurs pour les courbes du graphique (une couleur par unité)
const LINE_COLORS = [
  "#4f46e5", // indigo
  "#16a34a", // vert
  "#ea580c", // orange
  "#0891b2", // cyan
  "#9333ea", // violet
  "#db2777", // rose
  "#ca8a04", // jaune
];


// ============================================================
// BLOC 3 — FONCTIONS UTILITAIRES
// ============================================================

/**
 * Formate un nombre avec séparateurs de milliers.
 * Retourne "0" si la valeur est nulle ou undefined.
 * Exemple : formatNum(1500) → "1 500"
 */
function formatNum(n) {
  return n != null ? Number(n).toLocaleString() : "0";
}

/**
 * Retourne les classes Tailwind CSS selon le pourcentage de rendement.
 * - null/undefined → gris (pas de donnée)
 * - >= 95%         → vert  (bon rendement)
 * - >= 80%         → orange (rendement moyen)
 * - < 80%          → rouge  (mauvais rendement)
 */
function yieldStyle(pct) {
  if (pct == null) {
    return "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400";
  }
  if (pct >= 95) {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  if (pct >= 80) {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}


// ============================================================
// BLOC 4 — COMPOSANT ChartTooltip
// ============================================================
// Infobulle personnalisée affichée au survol du graphique.
// Recharts injecte automatiquement : active, payload (données), label (date).

function ChartTooltip({ active, payload, label }) {
  // Ne rien afficher si le tooltip n'est pas actif ou sans données
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs">
      {/* Date en titre */}
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>

      {/* Une ligne par unité de travail dans le payload */}
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          {/* Pastille colorée correspondant à la courbe */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color,
              display: "inline-block",
            }}
          />
          <span className="text-gray-500 dark:text-slate-400">{p.dataKey} :</span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">
            {p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}


// ============================================================
// BLOC 5 — COMPOSANT ProductionModal
// ============================================================
// Modale pour AJOUTER ou MODIFIER un enregistrement de production.
// Props :
//   record  → enregistrement existant (édition) ou null (création)
//   onSave  → callback appelé après sauvegarde réussie
//   onClose → callback pour fermer la modale
//   t       → fonction de traduction

function ProductionModal({ record, onSave, onClose, t }) {
  // Si record a un _id → mode édition, sinon → mode création
  const isEdit = Boolean(record?._id);

  // État du formulaire : pré-rempli avec record en édition, sinon valeurs vides + date du jour
  const [form, setForm] = useState(
    record
      ? { ...record }
      : { ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] }
  );

  const [saving, setSaving] = useState(false); // true pendant l'appel API
  const [error, setError]   = useState("");    // message d'erreur à afficher

  // Met à jour un seul champ du formulaire sans écraser les autres
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Soumission du formulaire : appelle create ou update selon le mode
  const handleSubmit = async (e) => {
    e.preventDefault(); // empêche le rechargement de la page
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateProduction(record._id, form);
      } else {
        await createProduction(form);
      }
      onSave(); // notifie le parent pour recharger les données
    } catch (err) {
      // Affiche l'erreur renvoyée par l'API, ou le message générique
      setError(err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  // Définition des champs du formulaire (label + type)
  const fields = [
    { key: "date",               label: t("prod.date"),     type: "date"   },
    { key: "workUnit",           label: t("prod.workUnit"), type: "text"   },
    { key: "goodQty",            label: t("prod.goodQty"),  type: "number" },
    { key: "defectsQty",         label: t("prod.defects"),  type: "number" },
    { key: "scrapQty",           label: t("prod.scrap"),    type: "number" },
    { key: "workSeconds",        label: t("prod.workTime"), type: "number" },
    { key: "theoreticalSeconds", label: "Theoretical (s)",  type: "number" },
  ];

  return (
    // Overlay sombre en arrière-plan
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-lg mx-4 p-6">

        {/* En-tête : titre + bouton fermer */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            {isEdit ? t("prod.editRecord") : t("prod.addRecord")}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bandeau d'erreur — visible uniquement en cas d'échec API */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Formulaire : génération dynamique des champs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                {field.label}
              </label>
              <input
                type={field.type}
                value={form[field.key] ?? ""}
                onChange={(e) =>
                  handleChange(
                    field.key,
                    // Convertit en nombre si type="number", sinon garde le texte
                    field.type === "number" ? Number(e.target.value) : e.target.value
                  )
                }
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                // date et workUnit sont obligatoires
                required={field.key === "date" || field.key === "workUnit"}
              />
            </div>
          ))}

          {/* Boutons Annuler / Enregistrer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              {t("prod.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("prod.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ============================================================
// BLOC 6 — COMPOSANT PRINCIPAL Production
// ============================================================
// Page complète de gestion de la production :
//   - Filtres (date, unité, rendement, recherche)
//   - Graphique d'évolution des bonnes pièces
//   - Tableau paginé avec actions Edit / Delete
//   - Modale d'ajout/édition
//   - Toast de confirmation

function Production() {
  const { t } = useI18n(); // fonction de traduction

  // --- Dates par défaut : aujourd'hui et il y a 30 jours ---
  const today     = new Date().toISOString().split("T")[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  // ── États des filtres ──────────────────────────────────────
  const [from,         setFrom]         = useState(thirtyAgo); // date de début
  const [to,           setTo]           = useState(today);     // date de fin
  const [selectedUnit, setSelectedUnit] = useState("");        // unité filtrée ("" = toutes)
  const [search,       setSearch]       = useState("");        // texte de recherche
  const [yieldFilter,  setYieldFilter]  = useState("all");     // filtre rendement : all/green/orange/red
  const [page,         setPage]         = useState(0);         // page courante (index 0)

  // ── États des données ──────────────────────────────────────
  const [records,      setRecords]      = useState([]);  // enregistrements page courante
  const [allRecords,   setAllRecords]   = useState([]);  // tous les enregistrements (pour le graphique)
  const [workUnits,    setWorkUnits]    = useState([]);  // unités issues des résultats courants
  const [allWorkUnits, setAllWorkUnits] = useState([]);  // toutes les unités connues (pour le filtre)
  const [total,        setTotal]        = useState(0);   // nombre total de résultats (pagination)

  // ── États UI ───────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);  // spinner de chargement du tableau
  const [modal,        setModal]        = useState(null);  // null | { type: "add" } | { type: "edit", record }
  const [toast,        setToast]        = useState("");    // message de confirmation temporaire
  const [showChart,    setShowChart]    = useState(true);  // afficher/masquer le graphique
  const [fallbackDate, setFallbackDate] = useState(null); // date réelle si les données viennent d'une autre période


  // ── Chargement des données paginées (tableau) ──────────────
  // Se re-exécute quand les filtres ou la page changent.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        from,
        to,
        limit: PAGE_SIZE,
        skip: page * PAGE_SIZE,
        byUnit: true, // toujours demander les vrais noms d'unités
      };
      if (selectedUnit) params.workUnit = selectedUnit;

      const res = await fetchProduction(params);
      setRecords(res?.records || []);
      setTotal(res?.total || 0);
      if (res?.workUnits) setWorkUnits(res.workUnits);
      // Si l'API renvoie un fallback (aucune donnée sur la période demandée),
      // on stocke la date réelle des données affichées.
      setFallbackDate(res?.fallback ? res.fallbackDate : null);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedUnit, page]);

  // ── Chargement de TOUTES les données pour le graphique ─────
  // Limite à 2000 entrées pour éviter de surcharger.
  const loadAllForChart = useCallback(async () => {
    try {
      const params = {
        from,
        to,
        limit: 2000,
        skip: 0,
        byUnit: true,
      };
      if (selectedUnit) params.workUnit = selectedUnit;

      const res = await fetchProduction(params);
      setAllRecords(res?.records || []);
    } catch (err) {
      console.error("Chart load error:", err);
    }
  }, [from, to, selectedUnit]);

  // Déclenche les chargements à chaque changement de dépendances
  useEffect(() => { loadData();        }, [loadData]);
  useEffect(() => { loadAllForChart(); }, [loadAllForChart]);

  // Charge la liste complète des unités de travail (une seule fois au montage)
  useEffect(() => {
    fetchWorkUnits()
      .then((res) => { if (res?.workUnits) setAllWorkUnits(res.workUnits); })
      .catch(() => {});
  }, []);


  // ── Helpers UI ─────────────────────────────────────────────

  // Affiche un toast vert pendant 3 secondes
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Appelé après création ou modification : ferme la modale, recharge, toast
  const handleSave = async () => {
    setModal(null);
    showToast(t("prod.saveSuccess"));
    await loadData();
    await loadAllForChart();
  };

  // Supprime un enregistrement après confirmation.
  // Garde-fou : on vérifie que l'id est bien présent (pas une ligne agrégée).
  const handleDelete = async (id) => {
    if (!id) {
      console.error("handleDelete appelé sans id valide (ligne agrégée ?)");
      return;
    }
    if (!window.confirm(t("prod.deleteConfirm"))) return;
    try {
      await deleteProduction(id);
      showToast(t("prod.deleteSuccess"));
      await loadData();
      await loadAllForChart();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };


  // ── Données dérivées (mémorisées) ──────────────────────────

  // Lignes filtrées localement (recherche texte + filtre rendement)
  const filtered = useMemo(() => {
    let rows = search
      ? records.filter((r) => {
          const unit = r.workUnit?.toLowerCase() || "";
          return unit.includes(search.toLowerCase()) || r.date?.includes(search);
        })
      : records;

    if (yieldFilter === "green")  rows = rows.filter((r) => Number(r.yieldPct) >= 95);
    if (yieldFilter === "orange") rows = rows.filter((r) => Number(r.yieldPct) >= 80 && Number(r.yieldPct) < 95);
    if (yieldFilter === "red")    rows = rows.filter((r) => Number(r.yieldPct) < 80);

    return rows;
  }, [records, search, yieldFilter]);

  // Nombre total de pages
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Données formatées pour Recharts :
  // → series : tableau de { date, unitA: qty, unitB: qty, … }
  // → units  : liste des noms d'unités (une courbe par unité)
  const chartData = useMemo(() => {
    // Si une unité est sélectionnée : on utilise les records paginés (vrais noms).
    // Sinon : on utilise allRecords pour montrer TOUTES les unités.
    const source = selectedUnit ? records : allRecords;
    if (!source.length) return { series: [], units: [] };

    const byDate = {};
    source.forEach((r) => {
      const unit = r.workUnit || "—";
      if (!byDate[r.date]) byDate[r.date] = { date: r.date };
      // Additionne les bonnes pièces par date et par unité
      byDate[r.date][unit] = (byDate[r.date][unit] || 0) + (r.goodQty || 0);
    });

    const series = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    const units  = [...new Set(source.map((r) => r.workUnit || "—"))].sort();

    return { series, units };
  }, [allRecords, records, selectedUnit]);

  // Compteurs par couleur de rendement (pour les badges des boutons de filtre)
  const yieldCounts = useMemo(() => {
    const counts = { all: records.length, green: 0, orange: 0, red: 0 };
    records.forEach((r) => {
      const pct = Number(r.yieldPct);
      if      (pct >= 95) counts.green  += 1;
      else if (pct >= 80) counts.orange += 1;
      else                counts.red    += 1;
    });
    return counts;
  }, [records]);


  // ── Rendu JSX ──────────────────────────────────────────────
  return (
    <div className={ui.page}>

      {/* === En-tête : titre + bouton Ajouter === */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={ui.cardHeaderTitle}>{t("prod.title")}</h1>
          <p className={ui.cardHeaderSub}>{t("prod.subtitle")}</p>
        </div>
        <button onClick={() => setModal({ type: "add" })} className={ui.btnPrimary}>
          <Plus className="w-4 h-4" />
          {t("prod.addRecord")}
        </button>
      </div>

      {/* === Bandeau fallback : affiché quand l'API renvoie des données d'une autre période === */}
      {fallbackDate && (
        <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            Aucune donnée pour la période sélectionnée.
            Affichage des dernières données disponibles du <strong>{fallbackDate}</strong>.
          </span>
        </div>
      )}

      {/* === Barre de filtres === */}
      <div className={ui.filterBar}>
        {/* Ligne 1 : date début, date fin, unité, recherche */}
        <div className={ui.filterRow}>
          <FilterField label={t("prod.from")}>
            <CalendarPicker value={from} onChange={(v) => { setFrom(v); setPage(0); }} />
          </FilterField>

          <FilterField label={t("prod.to")}>
            <CalendarPicker value={to} onChange={(v) => { setTo(v); setPage(0); }} />
          </FilterField>

          <FilterField label={t("filter.allUnits")}>
            {/* Priorité à allWorkUnits (liste complète) sur workUnits (liste filtrée) */}
            <WorkUnitCombobox
              workUnits={allWorkUnits.length > 0 ? allWorkUnits : workUnits}
              value={selectedUnit}
              onChange={(v) => {
                setSelectedUnit(v === "All" ? "" : v);
                setPage(0);
              }}
            />
          </FilterField>

          <FilterField label={t("table.search")} className="ml-auto max-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("table.search")}
                className={`${ui.input} !pl-9`}
              />
            </div>
          </FilterField>
        </div>

        {/* Ligne 2 : boutons de filtre par rendement */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mr-1">
            Rendement :
          </span>
          {[
            {
              key: "all",
              label: "Tous",
              cls: "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300",
              activeCls: "bg-gray-100 dark:bg-slate-700 border-gray-400 font-semibold",
            },
            {
              key: "green",
              label: "✅ ≥ 95%",
              cls: "border-green-200 text-green-700 dark:border-green-800 dark:text-green-400",
              activeCls: "bg-green-50 dark:bg-green-900/30 border-green-400 font-semibold",
            },
            {
              key: "orange",
              label: "⚠️ 80–95%",
              cls: "border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-400",
              activeCls: "bg-orange-50 dark:bg-orange-900/30 border-orange-400 font-semibold",
            },
            {
              key: "red",
              label: "🔴 < 80%",
              cls: "border-red-200 text-red-700 dark:border-red-800 dark:text-red-400",
              activeCls: "bg-red-50 dark:bg-red-900/30 border-red-400 font-semibold",
            },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => { setYieldFilter(item.key); setPage(0); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                yieldFilter === item.key ? item.activeCls : item.cls
              }`}
            >
              {item.label}
              {/* Compteur entre parenthèses, légèrement transparent */}
              <span className="opacity-60">({yieldCounts[item.key]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* === Graphique d'évolution des bonnes pièces === */}
      {/* N'apparaît que si des données graphique sont disponibles */}
      {allRecords.length > 0 && chartData.series.length > 0 && (
        <div className={`${ui.card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Évolution des bonnes pièces
              </h2>
            </div>
            {/* Bouton toggle pour masquer / afficher le graphique */}
            <button
              onClick={() => setShowChart((v) => !v)}
              className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700"
            >
              {showChart ? "Masquer" : "Afficher"}
            </button>
          </div>

          {showChart && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData.series} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(d) => {
                    // Formate les dates en "jj mois" (ex: "15 jan.")
                    const dt = new Date(`${d}T00:00:00`);
                    return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                  }}
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                {/* Une courbe par unité de travail, couleur cyclique */}
                {chartData.units.map((unit, index) => (
                  <Line
                    key={unit}
                    type="monotone"
                    dataKey={unit}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}          // pas de point sur chaque valeur
                    activeDot={{ r: 4 }} // point visible uniquement au survol
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* === Tableau de données === */}
      <div className={`${ui.card} overflow-hidden`}>

        {/* État : chargement */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
          </div>

        /* État : aucune donnée */
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Factory className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-gray-400 dark:text-slate-500">{t("prod.noData")}</p>
          </div>

        /* État : données disponibles */
        ) : (
          <>
            {/* Bandeau d'avertissement en mode agrégé (pas d'unité sélectionnée)
                → Edit/Delete désactivés car pas de _id individuel */}
            {!selectedUnit && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                ℹ️ Vue agrégée — sélectionnez une unité de travail pour pouvoir modifier ou supprimer des enregistrements.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3">{t("prod.date")}</th>
                    <th className="text-left px-4 py-3">{t("prod.workUnit")}</th>
                    <th className="text-right px-4 py-3">{t("prod.goodQty")}</th>
                    <th className="text-right px-4 py-3">{t("prod.defects")}</th>
                    <th className="text-right px-4 py-3">{t("prod.scrap")}</th>
                    <th className="text-right px-4 py-3">{t("prod.total")}</th>
                    <th className="text-right px-4 py-3">{t("prod.yield")}</th>
                    <th className="text-center px-4 py-3">{t("prod.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    // Clé : _id si enregistrement réel, sinon date (ligne agrégée)
                    <tr
                      key={r._id || r.date}
                      className="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{r.date}</td>
                      <td className="px-4 py-3 font-medium">{r.workUnit}</td>
                      <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">
                        {formatNum(r.goodQty)}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400">
                        {formatNum(r.defectsQty)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                        {formatNum(r.scrapQty)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatNum(r.productionTotal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* Badge coloré selon le seuil de rendement */}
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${yieldStyle(r.yieldPct)}`}>
                          {r.yieldPct != null ? `${r.yieldPct}%` : "—"}
                        </span>
                      </td>

                      {/* Boutons Edit / Delete — cachés si ligne agrégée (pas de _id) */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r._id && r.workUnit !== "ALL" ? (
                            <>
                              <button
                                onClick={() => setModal({ type: "edit", record: r })}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                title="Modifier"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(r._id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            // Tiret affiché à la place des boutons en mode agrégé
                            <span className="text-xs text-gray-300 dark:text-slate-600 italic">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* === Pagination === */}
            {/* Affichée seulement si plus d'une page */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-800">
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  Page <span className="font-semibold">{page + 1}</span> / {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  {/* Première page */}
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-30">
                    «
                  </button>
                  {/* Page précédente */}
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="p-1.5 border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Numéros de page (fenêtre glissante de 5 pages max) */}
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const startPage   = Math.max(0, Math.min(page - 2, totalPages - 5));
                    const currentPage = startPage + i;
                    return (
                      <button
                        key={currentPage}
                        onClick={() => setPage(currentPage)}
                        className={`min-w-[28px] py-1 text-xs border rounded-lg ${
                          currentPage === page
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-gray-300 dark:border-slate-700"
                        }`}
                      >
                        {currentPage + 1}
                      </button>
                    );
                  })}

                  {/* Page suivante */}
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="p-1.5 border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {/* Dernière page */}
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-30">
                    »
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* === Modale Ajouter / Modifier === */}
      {modal && (
        <ProductionModal
          record={modal.type === "edit" ? modal.record : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
          t={t}
        />
      )}

      {/* === Toast de confirmation === */}
      {/* Apparaît en bas à droite pendant 3 secondes après une action réussie */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-green-600 text-white text-sm font-medium rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default Production;