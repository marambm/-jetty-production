import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "theme";

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch (_) {}
  return "light";
}

function applyTheme(mode) {
  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function getSystemPreference() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const t = getStoredTheme();
    return t === "system" ? getSystemPreference() : t;
  });

  const setTheme = useCallback((value) => {
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (theme === "system") {
      const sysPref = getSystemPreference();
      applyTheme(sysPref);
      setResolvedTheme(sysPref);
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e) => {
        const resolved = e.matches ? "dark" : "light";
        applyTheme(resolved);
        setResolvedTheme(resolved);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    applyTheme(theme);
    setResolvedTheme(theme);
  }, [theme]);

  return { theme, setTheme, resolvedTheme };
}
