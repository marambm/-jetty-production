import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

function LogoutModal({ open, onCancel, onConfirm }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    setFading(true);
    setTimeout(() => {
      onConfirm();
    }, 500);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      data-testid="logout-modal-overlay"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div
        className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 transition-all duration-300 ${
          fading ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        data-testid="logout-modal-card"
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
          data-testid="button-modal-close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1" data-testid="text-modal-title">
            Confirmer la déconnexion
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            Voulez-vous vraiment quitter la session ?
          </p>

          <div className="flex items-center gap-3 w-full">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] hover:bg-gray-50 dark:hover:bg-slate-800"
              data-testid="button-modal-cancel"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-500/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              data-testid="button-modal-confirm"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogoutModal;
