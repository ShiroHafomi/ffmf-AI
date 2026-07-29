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
      className={`grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-text-secondary transition hover:bg-surface-hover hover:text-text dark:hover:bg-surface-active dark:hover:text-text ${className}`}
    >
      <Icon name={isDark ? "sun" : "moon"} className="h-5 w-5" />
    </button>
  );
}
