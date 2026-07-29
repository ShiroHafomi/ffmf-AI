"use client";

import { type ReactNode, type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "elevated";
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      className,
      variant = "default",
      hover = false,
      padding = "md",
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      default: "card",
      glass: "glass-card",
      elevated: "card card-hover",
    };

    const paddingClasses = {
      none: "",
      sm: "p-4",
      md: "card-padded",
      lg: "p-6 md:p-8",
    };

    return (
      <div
        ref={ref}
        className={cn(
          variantClasses[variant],
          hover && "card-hover",
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

export const CardHeader = ({
  children,
  className,
  title,
  subtitle,
  action,
  icon,
  ...props
}: CardHeaderProps) => {
  // If children provided, use them directly (new API)
  if (children) {
    return (
      <div className={cn("flex items-center justify-between gap-4 mb-4", className)} {...props}>
        {children}
      </div>
    );
  }

  // Old API with title, subtitle, icon, action
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-4", className)} {...props}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="mt-0.5 shrink-0 grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {title && <h2 className="card-title truncate">{title}</h2>}
          {subtitle && <p className="card-subtitle mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

CardHeader.displayName = "CardHeader";

export const CardTitle = ({
  children,
  className,
  icon,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) => {
  return (
    <div className="flex items-start justify-between gap-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="mt-0.5 shrink-0 grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className={cn("card-title truncate", className)}>{children}</h2>
          {subtitle && <p className="card-subtitle mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

CardTitle.displayName = "CardTitle";

export const CardContent = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className?: string }) => {
  return <div className={cn("card-content", className)} {...props}>{children}</div>;
};

CardContent.displayName = "CardContent";

export const CardFooter = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className?: string }) => {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 mt-4 pt-4 border-t",
        "border-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

CardFooter.displayName = "CardFooter";