"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "empty-state fade-in-up",
        className
      )}
    >
      {icon && (
        <div className="empty-state-icon">
          {icon}
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-description">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}