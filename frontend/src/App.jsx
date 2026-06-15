import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "./i18n/I18nProvider";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SidebarProvider, useSidebar } from "./components/SidebarContext";

import Dashboard from "./pages/Dashboard";
import Production from "./pages/Production";
import Kpis from "./pages/Kpis";
import Forecast from "./pages/Forecast";
import SettingsPage from "./pages/SettingsPage";
import Login from "./pages/Login";
import EmployeePerformancePage from "./pages/EmployeePerformancePage";

import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";

import { Loader2 } from "lucide-react";

/* -------------------- PROTECTED LAYOUT -------------------- */

function ProtectedLayout() {
  const { isAuthenticated, loading, isManager, hasPermission } = useAuth();
  const { collapsed } = useSidebar();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          collapsed ? "lg:ml-[72px]" : "lg:ml-64"
        }`}
      >
        <StatusBar />

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Routes>
            {/* Redirect par défaut */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Dashboard */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Production */}
            <Route
              path="/production"
              element={
                isManager || hasPermission("view_production") ? (
                  <Production />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            {/* KPIs */}
            <Route
              path="/kpis"
              element={
                isManager || hasPermission("view_kpis") ? (
                  <Kpis />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            {/* Forecast */}
            <Route
              path="/forecast"
              element={
                isManager || hasPermission("view_forecast") ? (
                  <Forecast />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            {/* Settings */}
            <Route
              path="/settings"
              element={
                isManager ? (
                  <SettingsPage />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            {/* Employee Performance */}
            <Route
              path="/employee-performance"
              element={<EmployeePerformancePage />}
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* -------------------- APP ROUTES -------------------- */

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login />
          )
        }
      />

      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

/* -------------------- APP ROOT -------------------- */

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SidebarProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SidebarProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;