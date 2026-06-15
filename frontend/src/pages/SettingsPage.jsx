import { useState, useEffect, useCallback, useRef } from "react";
import {
  Settings, Save, Plus, Trash2, Loader2, CheckCircle, AlertTriangle,
  BrainCircuit, ShieldCheck, Search, User, X,
  Eye, EyeOff, KeyRound, UserCog, RefreshCw, Lock, Shield, Check, AlertCircle,
  CalendarDays,
} from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";
import AddAdminModal from "../components/AddAdminModal";

const DEFAULT_SETTINGS = {
  globalObjective: 0,
  objectivesByWorkUnit: [],
  thresholds: {
    rendementWarning:  85,
    rendementCritical: 70,
    pertesWarning:     10,
    pertesCritical:    20,
  },
  forecastEnabled: true,
};

const INTERFACES = [
  { key: "view_dashboard",  label: "Dashboard",  description: "Vue générale et KPIs principaux" },
  { key: "view_production", label: "Production",  description: "Données de production en temps réel" },
  { key: "view_kpis",       label: "KPIs",        description: "Indicateurs de performance" },
  { key: "view_forecast",   label: "Prévisions",  description: "Forecasting et prédictions IA" },
];

const PASSWORD_RULES = [
  { id: "length",  label: "Au moins 8 caractères",       test: (p) => p.length >= 8 },
  { id: "upper",   label: "Une lettre majuscule (A–Z)",   test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "Une lettre minuscule (a–z)",   test: (p) => /[a-z]/.test(p) },
  { id: "digit",   label: "Au moins un chiffre (0–9)",    test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Un caractère spécial (@#$!…)", test: (p) => /[@#$!%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(p) },
];

let _rowIdCounter = Date.now();
const nextRowId = () => String(++_rowIdCounter);

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    workUnit:  r.workUnit  ?? "",
    objective: r.objective ?? 0,
    _uid: r._uid ?? (r._id ? String(r._id) : nextRowId()),
  }));
}

function toClampedInt(value, min = 0, max = Infinity) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ── Modal changement de mot de passe ─────────────────────────────────────────
function ChangePasswordModal({ user, onClose, onSuccess, showToast }) {
  const { t } = useI18n();
  const [newPwd,  setNewPwd]  = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const ruleResults = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(newPwd) }));
  const allRulesOk  = ruleResults.every((r) => r.ok);
  const confirmOk   = newPwd.length > 0 && newPwd === confirm;
  const canSubmit   = allRulesOk && confirmOk;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch(`/api/users/${user._id}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: newPwd }),
      });
      const json = await res.json();
      if (json.ok) {
        onSuccess();
        showToast(t("settings.passwordChangeSuccess", { username: user.username }), "success");
      } else {
        showToast(json.error || t("settings.passwordChangeError"), "error");
      }
    } catch {
      showToast(t("errors.network"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("settings.changePasswordTitle")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
          {t("settings.userLabel")} : <span className="font-semibold text-gray-800 dark:text-slate-200">{user.username}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{t("settings.newPassword")}</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 pr-9 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {newPwd.length > 0 && (
            <ul className="space-y-1.5 bg-gray-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700">
              {ruleResults.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${r.ok ? "bg-green-500" : "bg-gray-200 dark:bg-slate-700"}`}>
                    {r.ok && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className={r.ok ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-500 dark:text-slate-400"}>{t(`settings.passwordRule.${r.id}`)}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{t("settings.confirmPassword")}</label>
            <input
              type={showPwd ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("settings.confirmPasswordPlaceholder")}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${confirm && !confirmOk ? "border-red-400 dark:border-red-600" : "border-gray-300 dark:border-slate-700"}`}
            />
            {confirm && !confirmOk && (
              <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                <AlertCircle className="w-3 h-3" />{t("settings.passwordMismatch")}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800">{t("common.cancel")}</button>
          <button onClick={handleSave} disabled={!canSubmit || saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 transition-colors">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal accès aux interfaces ────────────────────────────────────────────────
function AccessModal({ user, onClose, onSuccess, showToast }) {
  const { t } = useI18n();
  const { token: authToken, refreshUser } = useAuth();
  const [selectedPerms, setSelectedPerms] = useState(Array.isArray(user.permissions) ? [...user.permissions] : []);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const togglePerm = (key) => {
    setError(null);
    setSelectedPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleConfirm = async () => {
    if (selectedPerms.length === 0) { setError(t("settings.accessNoSelection")); return; }
    setSaving(true);
    setError(null);
    const token = authToken || localStorage.getItem("jetty-token");
    try {
      const res = await fetch(`/api/users/${user._id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ permissions: selectedPerms }),
      });
      const json = await res.json();
      if (json.ok) {
        await refreshUser();
        showToast(t("settings.accessUpdateSuccess", { username: user.username }), "success");
        onSuccess(selectedPerms);
      } else {
        setError(json.error || t("settings.accessUpdateError"));
      }
    } catch {
      setError(t("errors.network"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("settings.accessTitle")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
            <ShieldCheck className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <p className="text-sm text-indigo-700 dark:text-indigo-300">{t("settings.accessForUser", { username: user.username })}</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-slate-400">{t("settings.accessSelectedCount", { count: selectedPerms.length, total: INTERFACES.length })}</p>
            <button type="button" onClick={() => selectedPerms.length === INTERFACES.length ? setSelectedPerms([]) : setSelectedPerms(INTERFACES.map(i => i.key))} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              {selectedPerms.length === INTERFACES.length ? t("settings.accessDeselectAll") : t("settings.accessSelectAll")}
            </button>
          </div>
          <div className="space-y-2">
            {INTERFACES.map((item) => {
              const checked = selectedPerms.includes(item.key);
              return (
                <button key={item.key} type="button" onClick={() => { togglePerm(item.key); setError(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${checked ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600 shadow-sm" : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700"}`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "bg-indigo-600" : "border-2 border-gray-300 dark:border-slate-600"}`}>
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${checked ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-slate-300"}`}>{item.label}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{item.description}</p>
                  </div>
                  {checked && <CheckCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={handleConfirm} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("settings.saving")}</> : <><Check className="w-4 h-4" /> {t("common.confirm")}</>}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              ← {t("common.back")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tableau gestion des utilisateurs ─────────────────────────────────────────
function UsersTable({ showToast }) {
  const { t } = useI18n();
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(null);
  const [pwdModal,    setPwdModal]    = useState(null);
  const [accessModal, setAccessModal] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch("/api/users", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      if (json.ok) setUsers(json.users || []);
    } catch {
      showToast(t("settings.usersLoadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleDelete = async (user) => {
    if (!confirm(t("settings.deleteUserConfirm", { username: user.username }))) return;
    setDeleting(user._id);
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch(`/api/users/${user._id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      if (json.ok) {
        showToast(t("settings.userDeleted", { username: user.username }), "success");
        setUsers(prev => prev.filter(u => u._id !== user._id));
      } else {
        showToast(json.error || t("settings.userDeleteError"), "error");
      }
    } catch {
      showToast(t("errors.network"), "error");
    } finally {
      setDeleting(null);
    }
  };

  const handleAccessSuccess = useCallback((userId, permissions) => {
    setUsers(prev => prev.map(u => u._id === userId ? { ...u, permissions } : u));
    setAccessModal(null);
  }, []);

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("settings.usersTitle")}</h2>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{t("settings.usersSubtitle")}</p>
            </div>
          </div>
          <button onClick={loadUsers} className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title={t("common.refresh")}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <User className="w-8 h-8 text-gray-300 dark:text-slate-600" />
            <p className="text-sm text-gray-400 dark:text-slate-500">{t("settings.noUsers")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                  <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-slate-400">{t("settings.user")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">{t("settings.createdAt")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-slate-400">{t("settings.access")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-slate-400">{t("settings.password")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-slate-400">{t("settings.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(t("locale"), { day: "2-digit", month: "short", year: "numeric" }) : "—";
                  const permCount = user.permissions?.length ?? 0;
                  return (
                    <tr key={user._id} className="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                            {user.username?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-slate-100">{user.username}</p>
                            {user.email && <p className="text-xs text-gray-400 dark:text-slate-500">{user.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400 font-mono">{fmtDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${permCount === 0 ? "bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500" : permCount === INTERFACES.length ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"}`}>
                            {permCount}/{INTERFACES.length}
                          </span>
                          <button onClick={() => setAccessModal(user)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors">
                            <Shield className="w-3 h-3" />{t("common.modify")}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setPwdModal(user)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors">
                          <Lock className="w-3 h-3" />{t("common.modify")}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDelete(user)} disabled={deleting === user._id || user.role === "manager"} title={user.role === "manager" ? t("settings.cannotDeleteManager") : t("common.delete")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg border border-red-200 dark:border-red-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deleting === user._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {users.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800">
            <span className="text-xs text-gray-400 dark:text-slate-500">{t("settings.usersCount", { count: users.length })}</span>
          </div>
        )}
      </div>
      {pwdModal    && <ChangePasswordModal user={pwdModal}    onClose={() => setPwdModal(null)}    onSuccess={() => setPwdModal(null)} showToast={showToast} />}
      {accessModal && <AccessModal         user={accessModal} onClose={() => setAccessModal(null)} onSuccess={(permissions) => handleAccessSuccess(accessModal._id, permissions)} showToast={showToast} />}
    </>
  );
}

// ── Section : Objectif journalier par date ────────────────────────────────────
function DailyObjectiveSection({ showToast }) {
  const today = new Date().toISOString().slice(0, 10);

  const [date,        setDate]        = useState(today);
  const [workUnit,    setWorkUnit]    = useState("global");
  const [objective,   setObjective]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [list,        setList]        = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [workUnits,   setWorkUnits]   = useState([]);

  const inputCls = "border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  useEffect(() => {
    const fetchWorkUnits = async () => {
      try {
        const token = localStorage.getItem("jetty-token");
        const res = await fetch("/api/work-units", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json.workUnits) setWorkUnits(json.workUnits);
      } catch {}
    };
    fetchWorkUnits();
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch("/api/settings/daily-objectives", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) setList(json.objectives || []);
    } catch {}
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!date) return;
    const existing = list.find((o) => o.date === date && o.workUnit === workUnit);
    setObjective(existing ? String(existing.objective) : "");
  }, [date, workUnit, list]);

  const notifyDashboard = (savedDate, savedWorkUnit) => {
    // ✅ dispatch avec date + workUnit pour que le dashboard sache quoi recharger
    window.dispatchEvent(new CustomEvent("jetty-settings-updated", {
      detail: { dailyObjective: true, date: savedDate, workUnit: savedWorkUnit }
    }));
    // ✅ localStorage en JSON pour le multi-onglet
    localStorage.setItem(
      "jetty-settings-updated",
      JSON.stringify({ ts: Date.now(), date: savedDate, workUnit: savedWorkUnit })
    );
  };

  const handleSave = async () => {
    if (!date) { showToast("La date est requise.", "error"); return; }
    if (objective === "" || isNaN(Number(objective)) || Number(objective) < 0) {
      showToast("L'objectif doit être un nombre positif.", "error"); return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch("/api/settings/daily-objective", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ date, workUnit, objective: Number(objective) }),
      });
      const json = await res.json();
      if (json.ok) {
        const label = workUnit === "global" ? "toutes les unités" : workUnit;
        showToast(`Objectif enregistré — ${label} · ${date}`, "success");
        // ✅ notifie avec date + workUnit
        notifyDashboard(date, workUnit);
        await loadList();
      } else {
        showToast(json.error || "Erreur lors de l'enregistrement.", "error");
      }
    } catch {
      showToast("Erreur réseau.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, deletedDate, deletedWorkUnit) => {
    try {
      const token = localStorage.getItem("jetty-token");
      const res = await fetch(`/api/settings/daily-objective/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) {
        setList((prev) => prev.filter((o) => o._id !== id));
        // ✅ notifie avec date + workUnit de l'objectif supprimé
        notifyDashboard(deletedDate, deletedWorkUnit);
      }
    } catch {
      showToast("Erreur lors de la suppression.", "error");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-6" data-testid="section-daily-objectives">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-5 h-5 text-indigo-500" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
          Objectif journalier par date
        </h2>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-5 ml-7">
        Définir un objectif spécifique pour une date et une unité de travail.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`w-full ${inputCls}`} data-testid="input-daily-date" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Unité de travail</label>
          <select value={workUnit} onChange={(e) => setWorkUnit(e.target.value)} className={`w-full ${inputCls}`} data-testid="input-daily-workunit">
            <option value="global">— Toutes les unités (global) —</option>
            {workUnits.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Objectif (unités)</label>
          <input type="number" min="0" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="ex : 1500" className={`w-full ${inputCls}`} data-testid="input-daily-objective" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
        <p className="text-xs text-gray-400 dark:text-slate-500" />
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors" data-testid="button-save-daily-objective">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
      </div>

      {(loadingList || list.length > 0) && (
        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Objectifs enregistrés</p>
            <button onClick={loadList} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title="Rafraîchir">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {loadingList ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {list.slice().sort((a, b) => b.date.localeCompare(a.date) || a.workUnit.localeCompare(b.workUnit)).map((obj) => (
                <div key={obj._id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-gray-400 dark:text-slate-500 flex-shrink-0">{obj.date}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">
                      {obj.workUnit === "global" ? "Toutes les unités" : obj.workUnit}
                    </span>
                    {obj.workUnit === "global" && (
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">global</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{Number(obj.objective).toLocaleString()} unités</span>
                    {/* ✅ passe date + workUnit au handleDelete */}
                    <button onClick={() => handleDelete(obj._id, obj.date, obj.workUnit)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Supprimer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page Paramètres ───────────────────────────────────────────────────────────
function SettingsPage() {
  const { t }         = useI18n();
  const { isManager } = useAuth();
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState(null);

  const [empSearch,    setEmpSearch]    = useState("");
  const [empResult,    setEmpResult]    = useState(null);
  const [empLoading,   setEmpLoading]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = empSearch.trim();
    if (!q) { setEmpResult(null); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setEmpLoading(true);
      setShowDropdown(true);
      try {
        const token = localStorage.getItem("jetty-token");
        const res = await fetch(`/api/employees/search?name=${encodeURIComponent(q)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json.ok) setEmpResult(json.employees ?? (json.employee ? [json.employee] : []));
        else setEmpResult([]);
      } catch {
        setEmpResult([]);
      } finally {
        setEmpLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [empSearch]);

  const clearEmpSearch = () => { setEmpSearch(""); setEmpResult(null); setShowDropdown(false); };
  const selectEmployee = (emp) => { setEmpSearch(emp.name); setEmpResult([emp]); setShowDropdown(false); };

  const showToast = useCallback((message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("jetty-token");
        const res  = await fetch("/api/settings", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const json = await res.json();
        if (json.ok && json.settings) {
          const s = json.settings;
          setSettings({
            globalObjective:      Number(s.globalObjective) || 0,
            objectivesByWorkUnit: normalizeRows(s.objectivesByWorkUnit),
            forecastEnabled:      s.forecastEnabled ?? true,
            thresholds: {
              rendementWarning:  toClampedInt(s.thresholds?.rendementWarning,  0, 100) || 85,
              rendementCritical: toClampedInt(s.thresholds?.rendementCritical, 0, 100) || 70,
              pertesWarning:     toClampedInt(s.thresholds?.pertesWarning,     0)      || 10,
              pertesCritical:    toClampedInt(s.thresholds?.pertesCritical,    0)      || 20,
            },
          });
        }
      } catch {
        showToast(t("settings.loadError"), "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast, t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("jetty-token");
      const th = settings.thresholds;

      if (th.rendementWarning < 0 || th.rendementWarning > 100) {
        showToast(t("settings.warningRangeError"), "error"); setSaving(false); return;
      }
      if (th.rendementCritical < 0 || th.rendementCritical > 100) {
        showToast(t("settings.criticalRangeError"), "error"); setSaving(false); return;
      }

      const cleanedObjectives = settings.objectivesByWorkUnit
        .filter((r) => r.workUnit?.trim() !== "")
        .map(({ _uid, ...rest }) => ({
          workUnit:  rest.workUnit.trim(),
          objective: Number(rest.objective) || 0,
        }));

      for (const item of cleanedObjectives) {
        if (typeof item.objective !== "number" || isNaN(item.objective)) {
          showToast(t("settings.invalidObjective", { unit: item.workUnit }), "error");
          setSaving(false); return;
        }
      }

      const payload = {
        globalObjective:      Number(settings.globalObjective) || 0,
        forecastEnabled:      settings.forecastEnabled,
        objectivesByWorkUnit: cleanedObjectives,
        thresholds: {
          rendementWarning:  toClampedInt(th.rendementWarning,  0, 100),
          rendementCritical: toClampedInt(th.rendementCritical, 0, 100),
          pertesWarning:     toClampedInt(th.pertesWarning,     0),
          pertesCritical:    toClampedInt(th.pertesCritical,    0),
        },
      };

      const res  = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.ok) {
        if (json.settings) {
          const s = json.settings;
          setSettings(prev => ({
            ...prev,
            objectivesByWorkUnit: normalizeRows(s.objectivesByWorkUnit),
            thresholds: {
              rendementWarning:  toClampedInt(s.thresholds?.rendementWarning,  0, 100),
              rendementCritical: toClampedInt(s.thresholds?.rendementCritical, 0, 100),
              pertesWarning:     toClampedInt(s.thresholds?.pertesWarning,     0),
              pertesCritical:    toClampedInt(s.thresholds?.pertesCritical,    0),
            },
          }));
        }
        // seuils seulement — pas de date/workUnit ici
        localStorage.setItem("jetty-settings-updated", JSON.stringify({ ts: Date.now() }));
        window.dispatchEvent(new CustomEvent("jetty-settings-updated", {
          detail: { thresholds: payload.thresholds }
        }));
        showToast(
          `${t("settings.saveSuccess")}  —  ${t("settings.rendementWarning")} : ${payload.thresholds.rendementWarning}% ⚠ / ${payload.thresholds.rendementCritical}% 🔴  |  ${t("settings.pertesWarning")} : ${payload.thresholds.pertesWarning}% ⚠ / ${payload.thresholds.pertesCritical}% 🔴`,
          "success"
        );
      } else {
        showToast(json.error || t("settings.saveError"), "error");
      }
    } catch (err) {
      showToast(t("errors.network") + " : " + (err.message || t("errors.connection")), "error");
    } finally {
      setSaving(false);
    }
  };

  const updateThreshold = (key, value) => {
    setSettings(s => ({
      ...s,
      thresholds: { ...s.thresholds, [key]: value === "" ? "" : parseInt(value, 10) || 0 },
    }));
  };

  const clampThreshold = (key) => {
    setSettings(s => {
      const v = s.thresholds[key];
      const isRendement = key === "rendementWarning" || key === "rendementCritical";
      return {
        ...s,
        thresholds: { ...s.thresholds, [key]: toClampedInt(v, 0, isRendement ? 100 : Infinity) },
      };
    });
  };

  const addWorkUnitRow = () =>
    setSettings(s => ({
      ...s,
      objectivesByWorkUnit: [...s.objectivesByWorkUnit, { _uid: nextRowId(), workUnit: "", objective: 0 }],
    }));

  const removeWorkUnitRow = (uid) =>
    setSettings(s => ({
      ...s,
      objectivesByWorkUnit: s.objectivesByWorkUnit.filter(r => r._uid !== uid),
    }));

  const updateWorkUnitRow = (uid, field, value) =>
    setSettings(s => ({
      ...s,
      objectivesByWorkUnit: s.objectivesByWorkUnit.map(row =>
        row._uid !== uid ? row : { ...row, [field]: value }
      ),
    }));

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  const inputCls = "border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{t("settings.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <button onClick={() => setShowAddAdmin(true)} className="flex items-center gap-2 px-4 py-2.5 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium rounded-xl transition-colors">
              <ShieldCheck className="w-4 h-4" />{t("settings.addAdmin")}
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors" data-testid="button-save-settings">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
          toast.type === "success" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
          : toast.type === "error" ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
        }`}>
          <span className="flex-shrink-0 mt-0.5">
            {toast.type === "success" ? <CheckCircle className="w-4 h-4" /> : toast.type === "error" ? <AlertTriangle className="w-4 h-4" /> : <BrainCircuit className="w-4 h-4" />}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {showAddAdmin && (
        <AddAdminModal onClose={() => setShowAddAdmin(false)} onCreated={(user) => showToast(t("settings.adminCreated", { username: user.username }), "success")} />
      )}

      {/* Recherche employé */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("settings.employeeSearch")}</h2>
        </div>
        <div className="relative">
          <div className="relative">
            <input type="text" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder={t("settings.employeeSearchPlaceholder")} className={`w-full ${inputCls} pr-10`} autoComplete="off" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {empLoading ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
               : empSearch ? <button onClick={clearEmpSearch} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"><X className="w-3.5 h-3.5" /></button>
               : <Search className="w-4 h-4 text-gray-300 dark:text-slate-600" />}
            </div>
          </div>
          {showDropdown && empSearch.trim() && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
              {empLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 dark:text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {t("common.searching")}</div>
              ) : empResult?.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 dark:text-slate-500 italic">{t("settings.noEmployeeFound")}</div>
              ) : empResult?.length > 0 ? (
                <ul>
                  {empResult.map((emp) => (
                    <li key={emp._id || emp.employeeId}>
                      <button onClick={() => selectEmployee(emp)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors text-left">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                          {emp.name?.slice(0, 2).toUpperCase() || "??"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{emp.name}</p>
                          {emp.department && <p className="text-xs text-gray-400 dark:text-slate-500">{emp.department}</p>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
        {!showDropdown && empResult?.length > 0 && (
          <div className="mt-3 space-y-2">
            {empResult.map((emp) => (
              <div key={emp._id || emp.employeeId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                  {emp.name?.slice(0, 2).toUpperCase() || "??"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{emp.name}</p>
                  {emp.department && <p className="text-xs text-gray-400 dark:text-slate-500">{emp.department}</p>}
                </div>
                <button onClick={clearEmpSearch} className="text-gray-300 hover:text-red-400 dark:hover:text-red-400 transition-colors" title={t("common.clear")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isManager && <UsersTable showToast={showToast} />}
      {isManager && <DailyObjectiveSection showToast={showToast} />}

      {/* Seuils d'alerte */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 p-6" data-testid="section-thresholds">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{t("settings.thresholds")}</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-5 leading-relaxed">{t("settings.thresholdsHelp")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              {t("settings.rendementWarning")} <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-orange-400" />
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" value={settings.thresholds.rendementWarning} onChange={(e) => updateThreshold("rendementWarning", e.target.value)} onBlur={() => clampThreshold("rendementWarning")} className={`${inputCls} flex-1`} data-testid="input-rendement-warning" />
              <span className="text-sm text-gray-400 dark:text-slate-500 flex-shrink-0">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              {t("settings.rendementCritical")} <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500" />
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" value={settings.thresholds.rendementCritical} onChange={(e) => updateThreshold("rendementCritical", e.target.value)} onBlur={() => clampThreshold("rendementCritical")} className={`${inputCls} flex-1`} data-testid="input-rendement-critical" />
              <span className="text-sm text-gray-400 dark:text-slate-500 flex-shrink-0">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              {t("settings.pertesWarning")} <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-orange-400" />
            </label>
            <input type="number" min="0" value={settings.thresholds.pertesWarning} onChange={(e) => updateThreshold("pertesWarning", e.target.value)} onBlur={() => clampThreshold("pertesWarning")} className={`w-full ${inputCls}`} data-testid="input-pertes-warning" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              {t("settings.pertesCritical")} <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500" />
            </label>
            <input type="number" min="0" value={settings.thresholds.pertesCritical} onChange={(e) => updateThreshold("pertesCritical", e.target.value)} onBlur={() => clampThreshold("pertesCritical")} className={`w-full ${inputCls}`} data-testid="input-pertes-critical" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;