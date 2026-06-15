import { useState, useEffect } from "react";
import { X, Eye, EyeOff, KeyRound, Loader2, Check, AlertCircle, CheckCircle2 } from "lucide-react";

const passwordRules = [
  { id: "length",  label: "Au moins 8 caractères",         test: (p) => p.length >= 8 },
  { id: "upper",   label: "Une lettre majuscule",           test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "Une lettre minuscule",           test: (p) => /[a-z]/.test(p) },
  { id: "number",  label: "Au moins un chiffre",            test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Un caractère spécial (@#$!...)", test: (p) => /[@#$!%^&*]/.test(p) },
];

// ✅ Accepte isOpen pour contrôler l'affichage sans démonter/remonter le composant
export default function ChangePasswordModal({ isOpen, onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showOld,     setShowOld]     = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(false);

  // ✅ Réinitialise le formulaire à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      setShowOld(false);
      setShowNew(false);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  // ✅ Si fermé, ne rien afficher
  if (!isOpen) return null;

  const ruleResults = passwordRules.map((r) => ({ ...r, ok: r.test(newPassword) }));
  const allRulesOk  = ruleResults.every((r) => r.ok);
  const confirmOk   = newPassword.length > 0 && newPassword === confirm;
  const canSubmit   = oldPassword.length > 0 && allRulesOk && confirmOk;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // ✅ Lit le token depuis localStorage (stocké au login)
      const token = localStorage.getItem("jetty-token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      } else {
        setError(json.error || "Erreur lors du changement de mot de passe.");
      }
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Changer mon mot de passe
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Succès */}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Mot de passe modifié avec succès !
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Ancien mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Ancien mot de passe
            </label>
            <div className="relative">
              <input
                type={showOld ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => { setOldPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nouveau mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full border rounded-xl px-3 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  newPassword && allRulesOk
                    ? "border-green-400"
                    : "border-gray-300 dark:border-slate-700"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Règles de complexité */}
            {newPassword.length > 0 && (
              <ul className="mt-2 space-y-1.5 bg-gray-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700">
                {ruleResults.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      r.ok ? "bg-green-500" : "bg-gray-200 dark:bg-slate-700"
                    }`}>
                      {r.ok && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <span className={r.ok
                      ? "text-green-600 dark:text-green-400 font-medium"
                      : "text-gray-400 dark:text-slate-500"
                    }>
                      {r.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confirmer le mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Confirmer le nouveau mot de passe
            </label>
            <input
              type={showNew ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                confirm && !confirmOk
                  ? "border-red-400"
                  : confirm && confirmOk
                  ? "border-green-400"
                  : "border-gray-300 dark:border-slate-700"
              }`}
            />
            {confirm && !confirmOk && (
              <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
                <AlertCircle className="w-3 h-3" /> Les mots de passe ne correspondent pas.
              </p>
            )}
            {confirm && confirmOk && (
              <p className="flex items-center gap-1 mt-1 text-xs text-green-500">
                <CheckCircle2 className="w-3 h-3" /> Les mots de passe correspondent.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-800">
          <button
            onClick={handleSave}
            disabled={!canSubmit || saving || success}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...</>
              : <><Check className="w-4 h-4" /> Enregistrer</>
            }
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-xl transition-colors"
          >
            Annuler
          </button>
        </div>

      </div>
    </div>
  );
}