/* @refresh skip */
import { createContext, useContext, useState, useCallback } from "react";
import translations from "./translations";

const I18nContext = createContext();

const STORAGE_KEY = "jetty-lang";

function getInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch (_) {}
  return "fr";
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((newLang) => {
    if (translations[newLang]) {
      setLangState(newLang);
      try { localStorage.setItem(STORAGE_KEY, newLang); } catch (_) {}
    }
  }, []);

  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations.fr?.[key] ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}