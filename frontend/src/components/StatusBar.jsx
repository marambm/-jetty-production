import { Activity, Menu } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";
import { useSidebar } from "./SidebarContext";
import LanguageMenu from "./LanguageMenu";
import NotificationsMenu from "./NotificationsMenu";
import ThemeMenu from "./ThemeMenu";

function StatusBar() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { toggleCollapsed, toggleMobile } = useSidebar();

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 sm:px-6 py-2 flex items-center justify-between gap-4 sticky top-0 z-30" data-testid="status-bar">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (window.innerWidth >= 1024) {
              toggleCollapsed();
            } else {
              toggleMobile();
            }
          }}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:focus:ring-indigo-400/30"
          data-testid="button-hamburger"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Activity className="w-3.5 h-3.5" />
          <span>{t("app.system")}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5" data-testid="status-indicator">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-700 dark:text-green-400">{t("app.systemOk")}</span>
        </div>

        <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700" />

        <NotificationsMenu />
        <LanguageMenu />
        <ThemeMenu />

        {user && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400" data-testid="text-user-initial">
                  {user.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-gray-600 dark:text-slate-300 font-medium hidden sm:inline" data-testid="text-username">
                {user.username}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
