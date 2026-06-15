import { createContext, useContext, useState, useCallback, useEffect } from "react";
import client from "../api/client";

const AuthContext = createContext();
const TOKEN_KEY = "jetty-token";

function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getStoredToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getStoredToken());

  const setToken = useCallback((t) => {
    setTokenState(t);
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }, []);

  // Recharge le user depuis /api/auth/me pour mettre à jour les permissions
  // sans déconnecter l'utilisateur — appelé après PATCH permissions
  const refreshUser = useCallback(async () => {
    const tok = localStorage.getItem(TOKEN_KEY);
    if (!tok) return;
    try {
      const res = await client.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.data?.user) setUser(res.data.user);
    } catch {
      // Silencieux — on garde le user actuel en cas d'erreur réseau
    }
  }, []);

  useEffect(() => {
    if (!token) { setUser(null); setLoading(false); return; }
    client.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setUser(res.data.user))
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, [token, setToken]);

  const login = useCallback(async (username, password) => {
    const res = await client.post("/api/auth/login", { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  }, [setToken]);

  const logout = useCallback(() => { setToken(null); setUser(null); }, [setToken]);

  const isAuthenticated = !!token && !!user;
  const isManager = user?.role === "manager";
  const isAdmin = user?.role === "admin";

  const hasPermission = useCallback((permission) => {
    if (isManager) return true;
    return user?.permissions?.includes(permission) ?? false;
  }, [isManager, user]);

  return (
    <AuthContext.Provider value={{
      token, user, login, logout,
      isAuthenticated, loading,
      isManager, isAdmin,
      hasPermission,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
