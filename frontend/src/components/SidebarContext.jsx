import { createContext, useContext, useState, useCallback, useEffect } from "react";

const SidebarContext = createContext();

const COLLAPSED_KEY = "jetty-sidebar-collapsed";

function getStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch (_) {
    return false;
  }
}

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsedState] = useState(getStoredCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = useCallback((val) => {
    const next = typeof val === "function" ? val(collapsed) : val;
    setCollapsedState(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch (_) {}
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, mobileOpen, toggleMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
