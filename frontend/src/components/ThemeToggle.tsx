"use client";

import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle color theme"
      className={`grid h-9 w-9 place-items-center rounded-xl border border-ink-200 dark:border-ink-700 bg-surface text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-100 dark:hover:text-ink-900 ${className}`}
    >
      <Icon name={isDark ? "sun" : "moon"} className="h-5 w-5" />
    </button>
  );
}
