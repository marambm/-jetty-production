import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Factory, BarChart3, TrendingUp,
  Settings, LogOut, X, Trophy, KeyRound, ChevronUp,
} from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";
import { useSidebar } from "./SidebarContext";
import LogoutModal from "./LogoutModal";
import ChangePasswordModal from "./ChangePasswordModal";
import logo from "../asset/logo.png";

const allMenuItems = [
  { key: "menu.dashboard",          icon: LayoutDashboard, to: "/dashboard",            permission: null },
  { key: "menu.production",         icon: Factory,          to: "/production",           permission: "view_production" },
  { key: "menu.kpis",               icon: BarChart3,        to: "/kpis",                 permission: "view_kpis" },
  { key: "menu.forecast",           icon: TrendingUp,       to: "/forecast",             permission: "view_forecast" },
  { key: "menu.employeePerformance",icon: Trophy,           to: "/employee-performance", permission: "view_production" },
  { key: "menu.settings",           icon: Settings,         to: "/settings",             permission: "manage_settings", managerOnly: true },
];

function Sidebar() {
  const { t } = useI18n();
  const { user, logout, isManager, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { collapsed, mobileOpen, closeMobile } = useSidebar();

  const [showLogout,         setShowLogout]         = useState(false);
  const [showProfileMenu,    setShowProfileMenu]    = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuItems = allMenuItems.filter((item) => {
    if (item.managerOnly)        return isManager;
    if (item.permission === null) return true;
    if (isManager)               return true;
    return hasPermission(item.permission);
  });

  const handleLogoutConfirm = () => { logout(); navigate("/login"); };

  const expanded  = !collapsed;
  const initials  = user?.username?.slice(0, 2).toUpperCase() || "??";
  const roleLabel = user?.role === "manager" ? t("settings.role.manager") : t("settings.role.admin");

  const handleOpenChangePassword = (e) => {
    e.stopPropagation();
    setShowProfileMenu(false);
    setShowChangePassword(true);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className={`border-b border-white/10 ${collapsed ? "px-3 py-4" : "px-4 py-4"}`}>
        <div className="flex items-center justify-center">
          {collapsed ? (
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md flex-shrink-0">
              <img src={logo} alt="Jetty Technology" className="w-8 h-8 object-contain" />
            </div>
          ) : (
            <div className="w-full bg-white rounded-xl px-3 py-2 flex items-center justify-center shadow-md">
              <img src={logo} alt="Jetty Technology" className="h-12 w-auto object-contain" />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {menuItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            onClick={closeMobile}
            className={({ isActive }) =>
              `w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`
            }
            title={collapsed ? t(item.key) : undefined}
          >
            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
            {expanded && <span className="whitespace-nowrap overflow-hidden">{t(item.key)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Zone profil + déconnexion */}
      <div className={`mt-auto border-t border-slate-700 ${collapsed ? "px-2" : "px-3"}`}>

        {/* ── Profil (sidebar expanded) ── */}
        {expanded && (
          <div className="pt-3 pb-2 relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
                <p className="text-xs text-slate-400">{roleLabel}</p>
              </div>
              <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} />
            </button>

            {/* Menu déroulant */}
            {showProfileMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-[60]">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={handleOpenChangePassword}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors text-left"
                >
                  <KeyRound className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  {t("sidebar.changePassword")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Avatar seul (sidebar collapsed) ── */}
        {collapsed && (
          <div className="pt-3 pb-2 flex justify-center">
            <button
              onClick={() => setShowChangePassword(true)}
              className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold hover:bg-indigo-400 transition-colors"
              title={t("sidebar.changePassword")}
            >
              {initials}
            </button>
          </div>
        )}

        {/* Déconnexion */}
        <div className="pb-3">
          <button
            onClick={() => setShowLogout(true)}
            className={`w-full flex items-center justify-center gap-2.5 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white text-sm font-semibold tracking-wide rounded-2xl shadow-lg shadow-red-900/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-red-500/30 active:scale-[0.98] ${
              collapsed ? "px-2" : "px-4"
            }`}
            title={collapsed ? t("login.logout") : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {expanded && <span className="whitespace-nowrap">{t("login.logout")}</span>}
          </button>
        </div>

        {expanded && (
          <div className="px-2 pb-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{t("app.version")}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className={`hidden lg:flex fixed top-0 left-0 h-screen bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white flex-col z-50 transition-all duration-300 ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeMobile} />
      )}

      {/* Sidebar mobile */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white flex-col z-50 lg:hidden transition-all duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button onClick={closeMobile} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Modals */}
      <LogoutModal
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogoutConfirm}
      />

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </>
  );
}

export default Sidebar;