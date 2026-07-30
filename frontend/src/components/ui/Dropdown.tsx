"use client";

import { useEffect, useRef, useState } from "react";
import { forwardRef, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: IconName;
  disabled?: boolean;
  variant?: "default" | "danger";
}

interface DropdownProps {
  items: DropdownItem[];
  trigger: (props: { open: boolean; onClick: () => void }) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  ({ items, trigger, align = "right", className }, ref) => {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      if (open) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    useEffect(() => {
      if (open) {
        function onKey(e: KeyboardEvent) {
          if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }
    }, [open]);

    const toggle = () => setOpen((o) => !o);
    const close = () => setOpen(false);

    const triggerProps = { open, onClick: toggle };

    return (
      <div ref={ref} className={cn("relative inline-block", className)}>
        {trigger(triggerProps)}
        {open && (
          <div
            ref={dropdownRef}
            className={cn(
              "absolute z-dropdown mt-1.5 min-w-[160px] origin-top rounded-xl border border-border bg-surface shadow-float",
              "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
              align === "right" ? "right-0" : "left-0",
            )}
            role="menu"
          >
            <div className="p-1">
              {items.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    item.onClick();
                    close();
                  }}
                  disabled={item.disabled}
                  role="menuitem"
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors",
                    "hover:bg-surface-hover hover:text-text",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    item.variant === "danger" && "text-danger hover:bg-danger-soft/30 dark:hover:bg-danger-soft/10",
                  )}
                >
                  {item.icon && (
                    <span className="flex h-4 w-4 items-center justify-center shrink-0" aria-hidden="true">
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                  )}
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Dropdown.displayName = "Dropdown";

/**
 * Convenience trigger that renders a ghost icon button.
 * Use inside a Dropdown's trigger prop:
 *   trigger={({ open, onClick }) => <DropdownTrigger open={open} onClick={onClick} icon="menu" />}
 */
interface DropdownTriggerProps {
  open: boolean;
  onClick: () => void;
  icon: IconName;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function DropdownTrigger({
  open,
  onClick,
  icon,
  className,
  disabled,
  "aria-label": ariaLabel,
  title,
}: DropdownTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={ariaLabel}
      title={title}
      className={cn("min-h-[44px] min-w-[44px]", className)}
    >
      <Icon name={icon} className="h-5 w-5" />
    </Button>
  );
}