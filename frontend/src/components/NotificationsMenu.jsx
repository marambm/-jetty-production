import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function timeAgo(dateStr) {
  const now = new Date();
  const created = new Date(dateStr + "T00:00:00Z");
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}j`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

function NotificationsMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    async function fetchAlerts() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/alerts?limit=20`, {
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.ok && data.alerts) {
          setNotifications(data.alerts);
          setUnreadCount(data.alerts.length);
        }
      } catch (err) {
        console.error("Erreur chargement alertes:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleMarkAllRead = () => setUnreadCount(0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:focus:ring-indigo-400/30"
        data-testid="button-notifications"
      >
        <Bell className="w-4 h-4 text-slate-700 dark:text-slate-200" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg dark:shadow-slate-950/50 z-50">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("notif.title")}
              {notifications.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({notifications.length})
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all"
                data-testid="button-mark-all-read"
              >
                {t("notif.markAllRead")}
              </button>
            )}
          </div>

          {/* Liste */}
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                Chargement...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                {t("notif.empty")}
              </div>
            ) : (
              notifications.map((n, i) => (
                <div
                  key={`${n.date}-${n.workUnit}-${n.type}-${i}`}
                  className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      n.level === "red" ? "bg-red-500" : "bg-orange-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">
                      {n.message}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {n.date} · {timeAgo(n.date)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-center">
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                {notifications.length} alertes actives
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default NotificationsMenu;