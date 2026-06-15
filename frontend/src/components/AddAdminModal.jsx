import { useState } from "react";
import { X, Eye, EyeOff, Check, Loader2, ShieldCheck, Layout, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n/I18nProvider";

const INTERFACES = [
  { key: "view_dashboard",  label: "Dashboard",    description: "Vue générale et KPIs principaux" },
  { key: "view_production", label: "Production",   description: "Données de production en temps réel" },
  { key: "view_kpis",       label: "KPIs",         description: "Indicateurs de performance" },
  { key: "view_forecast",   label: "Prévisions",   description: "Forecasting et prédictions IA" },
];

const passwordRules = [
  { id: "length",  label: "Au moins 8 caractères",         test: (p) => p.length >= 8 },
  { id: "upper",   label: "Une lettre majuscule",           test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "Une lettre minuscule",           test: (p) => /[a-z]/.test(p) },
  { id: "number",  label: "Au moins un chiffre",            test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Un caractère spécial (@#$!...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrengthBar({ password }) {
  const { t } = useI18n();
  const passed = passwordRules.filter((r) => r.test(password)).length;
  const colors = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-blue-400", "bg-green-500"];
  const labels = [
    t("addAdmin.passwordStrength.veryWeak"),
    t("addAdmin.passwordStrength.weak"),
    t("addAdmin.passwordStrength.medium"),
    t("addAdmin.passwordStrength.strong"),
    t("addAdmin.passwordStrength.veryStrong"),
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= passed ? colors[passed - 1] : "bg-gray-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${colors[passed - 1]?.replace("bg-", "text-") || "text-gray-400"}`}>
        {labels[passed - 1] || ""}
      </p>
      <div className="grid grid-cols-1 gap-1">
        {passwordRules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 ${
              rule.test(password) ? "bg-green-500" : "bg-gray-200 dark:bg-slate-700"
            }`}>
              {rule.test(password) && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className={`text-xs ${
              rule.test(password) ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"
            }`}>
              {t(`addAdmin.passwordRule.${rule.id}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AddAdminModal({ onClose, onCreated }) {
  const { t } = useI18n();
  const { token: authToken } = useAuth();
  const [step, setStep] = useState("form");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateForm = () => {
    const newErrors = {};
    if (!username.trim()) {
      newErrors.username = t("addAdmin.errors.usernameRequired");
    } else if (username.trim().length < 3) {
      newErrors.username = t("addAdmin.errors.usernameMinLength");
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      newErrors.username = t("addAdmin.errors.usernameInvalidChars");
    }
    if (!email.trim()) {
      newErrors.email = t("addAdmin.errors.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = t("addAdmin.errors.emailInvalid");
    }
    if (!password) {
      newErrors.password = t("addAdmin.errors.passwordRequired");
    } else {
      const failedRules = passwordRules.filter((r) => !r.test(password));
      if (failedRules.length > 0) {
        newErrors.password = t("addAdmin.errors.passwordWeak");
      }
    }
    return newErrors;
  };

  const handleGoToAccess = () => {
    setTouched({ username: true, email: true, password: true });
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setStep("access");
  };

  const togglePerm = (key) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleConfirm = async () => {
    if (selectedPerms.length === 0) {
      setErrors({ perms: t("addAdmin.errors.noInterfaceSelected") });
      return;
    }

    const token = authToken || localStorage.getItem("jetty-token");

    if (!token) {
      setErrors({ api: t("addAdmin.errors.sessionExpired") });
      return;
    }

    setCreating(true);
    setErrors({});

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          permissions: selectedPerms,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        onCreated(json.user);
        onClose();
      } else {
        if (res.status === 409) {
          setErrors({ api: json.error });
          setStep("form");
        } else if (res.status === 401 || res.status === 403) {
          setErrors({ api: t("addAdmin.errors.accessDenied") });
          setStep("form");
        } else {
          setErrors({ api: json.error || t("addAdmin.errors.creationFailed") });
          setStep("form");
        }
      }
    } catch {
      setErrors({ api: t("addAdmin.errors.networkError") });
      setStep("form");
    } finally {
      setCreating(false);
    }
  };

  const isPasswordValid = passwordRules.every((r) => r.test(password));

  // Traduction des labels des interfaces (statiques mais on utilise t pour cohérence)
  const translatedInterfaces = INTERFACES.map((iface) => ({
    ...iface,
    label: t(`addAdmin.interface.${iface.key}`),
    description: t(`addAdmin.interface.${iface.key}Desc`),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              {step === "form" ? t("addAdmin.titleForm") : t("addAdmin.titleAccess")}
            </h2>
          </div>
          <div className="flex items-center gap-2 mr-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === "form" ? "bg-indigo-600 text-white" : "bg-green-500 text-white"
            }`}>
              {step === "form" ? "1" : <Check className="w-3.5 h-3.5" />}
            </div>
            <div className="w-6 h-0.5 bg-gray-200 dark:bg-slate-700" />
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === "access" ? "bg-indigo-600 text-white" : "bg-gray-200 dark:bg-slate-700 text-gray-400"
            }`}>
              2
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Étape 1 : Formulaire ── */}
        {step === "form" && (
          <div className="px-6 py-5 space-y-4">

            {errors.api && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.api}
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                {t("addAdmin.username")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (touched.username) {
                    const err = validateForm();
                    setErrors((prev) => ({ ...prev, username: err.username }));
                  }
                }}
                onBlur={() => {
                  setTouched((prev) => ({ ...prev, username: true }));
                  const err = validateForm();
                  setErrors((prev) => ({ ...prev, username: err.username }));
                }}
                placeholder={t("addAdmin.usernamePlaceholder")}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                  errors.username && touched.username
                    ? "border-red-400 focus:ring-red-300"
                    : username && !errors.username
                    ? "border-green-400 focus:ring-green-300"
                    : "border-gray-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
                autoFocus
              />
              {errors.username && touched.username && (
                <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
                  <AlertCircle className="w-3 h-3" /> {errors.username}
                </p>
              )}
              {username && !errors.username && (
                <p className="flex items-center gap-1 mt-1 text-xs text-green-500">
                  <CheckCircle2 className="w-3 h-3" /> {t("addAdmin.validUsername")}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                {t("addAdmin.email")} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (touched.email) {
                      const err = validateForm();
                      setErrors((prev) => ({ ...prev, email: err.email }));
                    }
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, email: true }));
                    const err = validateForm();
                    setErrors((prev) => ({ ...prev, email: err.email }));
                  }}
                  placeholder={t("addAdmin.emailPlaceholder")}
                  className={`w-full pl-10 pr-4 border rounded-xl py-2.5 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                    errors.email && touched.email
                      ? "border-red-400 focus:ring-red-300"
                      : email && !errors.email
                      ? "border-green-400 focus:ring-green-300"
                      : "border-gray-300 dark:border-slate-700 focus:ring-indigo-500"
                  }`}
                />
              </div>
              {errors.email && touched.email && (
                <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
                  <AlertCircle className="w-3 h-3" /> {errors.email}
                </p>
              )}
              {email && !errors.email && (
                <p className="flex items-center gap-1 mt-1 text-xs text-green-500">
                  <CheckCircle2 className="w-3 h-3" /> {t("addAdmin.validEmail")}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                {t("addAdmin.password")} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (touched.password) {
                      const err = validateForm();
                      setErrors((prev) => ({ ...prev, password: err.password }));
                    }
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder={t("addAdmin.passwordPlaceholder")}
                  className={`w-full border rounded-xl px-3 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                    errors.password && touched.password
                      ? "border-red-400 focus:ring-red-300"
                      : isPasswordValid && password
                      ? "border-green-400 focus:ring-green-300"
                      : "border-gray-300 dark:border-slate-700 focus:ring-indigo-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrengthBar password={password} />
            </div>

            {/* Rôle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                {t("addAdmin.role")}
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-sm text-gray-500 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                {t("addAdmin.roleAdmin")}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleGoToAccess}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Layout className="w-4 h-4" />
                {t("addAdmin.goToAccess")}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* ── Étape 2 : Sélection des interfaces ── */}
        {step === "access" && (
          <div className="px-6 py-5 space-y-4">

            <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                {t("addAdmin.interfacesFor", { username })}
              </p>
            </div>

            {errors.perms && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.perms}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {t("addAdmin.selectedCount", { count: selectedPerms.length, total: translatedInterfaces.length })}
              </p>
              <button
                onClick={() =>
                  selectedPerms.length === translatedInterfaces.length
                    ? setSelectedPerms([])
                    : setSelectedPerms(translatedInterfaces.map((i) => i.key))
                }
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {selectedPerms.length === translatedInterfaces.length
                  ? t("addAdmin.deselectAll")
                  : t("addAdmin.selectAll")}
              </button>
            </div>

            <div className="space-y-2">
              {translatedInterfaces.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    togglePerm(item.key);
                    setErrors((prev) => ({ ...prev, perms: undefined }));
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    selectedPerms.includes(item.key)
                      ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600 shadow-sm"
                      : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                    selectedPerms.includes(item.key) ? "bg-indigo-600" : "border-2 border-gray-300 dark:border-slate-600"
                  }`}>
                    {selectedPerms.includes(item.key) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      selectedPerms.includes(item.key) ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-slate-300"
                    }`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{item.description}</p>
                  </div>
                  {selectedPerms.includes(item.key) && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
              <button
                onClick={handleConfirm}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {creating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("addAdmin.creating")}</>
                  : <><Check className="w-4 h-4" /> {t("addAdmin.confirmCreate")}</>
                }
              </button>
              <button
                onClick={() => setStep("form")}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                ← {t("common.back")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}