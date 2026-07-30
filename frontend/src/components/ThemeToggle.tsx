"use client";

import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle color theme"
      className={className}
    >
      <Icon name={isDark ? "sun" : "moon"} className="h-5 w-5" />
    </Button>
  );
}
