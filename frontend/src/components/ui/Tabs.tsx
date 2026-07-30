"use client";

import React, { type ReactNode, type HTMLAttributes, forwardRef, useState, Children } from "react";
import { cn } from "@/lib/utils";

export interface TabProps {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  variant?: "line" | "pills" | "underlined";
}

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      value,
      onValueChange,
      children,
      className,
      variant = "pills",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-6",
          variant === "pills" && "space-y-6",
          className
        )}
        {...props}
      >
        {/* Tab List */}
        <nav
          role="tablist"
          className={cn(
            "flex flex-wrap gap-1",
            variant === "pills" &&
              "glass-card p-1.5 rounded-xl",
            variant === "line" && "border-b border-border",
            variant === "underlined" && "border-b border-border"
          )}
        >
          {children}
        </nav>

        {/* Tab Panels */}
        <div role="tabpanel" aria-labelledby="tabs">
          {React.Children.map(children, (child) => {
            if (
              typeof child === "object" &&
              child !== null &&
              "props" in child &&
              typeof (child as any).props.value === "string"
            ) {
              const childProps = (child as any).props;
              if (childProps.value === value) {
                return (
                  <div
                    key={childProps.value}
                    id={`panel-${childProps.value}`}
                    role="tabpanel"
                    aria-labelledby={`tab-${childProps.value}`}
                    className="fade-in-up"
                  >
                    {childProps.children}
                  </div>
                );
              }
            }
            return null;
          })}
        </div>
      </div>
    );
  }
);

Tabs.displayName = "Tabs";

interface TabButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: (value: string) => void;
}

const Tab = forwardRef<HTMLButtonElement, TabButtonProps>(
  ({ value, label, icon, disabled = false, onClick, className, ...props }, ref) => {
    // We use a context-like pattern but simpler - parent Tabs handles value
    // This component is used inside Tabs and its visibility is controlled by Tabs
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={false} // Controlled by parent
        aria-controls={`panel-${value}`}
        id={`tab-${value}`}
        disabled={disabled}
        onClick={() => onClick?.(value)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        {icon && <span className="h-4 w-4" aria-hidden="true">{icon}</span>}
        {label}
      </button>
    );
  }
);

Tab.displayName = "Tab";

// Helper component for rendering tab panels
interface TabPanelProps {
  value: string;
  children: ReactNode;
}

const TabPanel = ({ value, children }: TabPanelProps) => {
  // This is just a marker component, actual rendering is done by Tabs
  return null;
};

TabPanel.displayName = "TabPanel";

export { Tabs, Tab, TabPanel };