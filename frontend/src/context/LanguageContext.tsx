"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translate, type Locale } from "@/lib/i18n/translations";
import { setActiveLocale } from "@/lib/format";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "ffms_locale";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start on English for both server render and the first client render so the
  // markup matches (no hydration mismatch). The saved preference is read from
  // localStorage in an effect and applied right after mount.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "en" || stored === "vi") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "vi" ? "vi" : "en";
    window.localStorage.setItem(STORAGE_KEY, locale);
    setActiveLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
