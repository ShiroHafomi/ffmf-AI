"use client";

import { LOCALES, type Locale } from "@/lib/i18n/translations";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

// Compact EN ⇄ VI toggle. Renders as a segmented control so it fits cleanly in
// both the desktop topbar and the auth form header.
export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-lg border p-0.5 text-xs font-medium",
        "border-ink-200 bg-white",
        "dark:border-ink-700 dark:bg-ink-900",
        className,
      )}
    >
      {LOCALES.map((l) => {
        const active = locale === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code as Locale)}
            aria-pressed={active}
            className={cn(
              "rounded-md px-2 py-1 transition",
              active
                ? "bg-brand-600 text-white"
                : "text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100",
            )}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
