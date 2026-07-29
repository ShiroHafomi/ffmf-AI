"use client";

import React, { forwardRef, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  email?: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fallback?: ReactNode;
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return "?";
}

function getColorFromName(name?: string, email?: string): string {
  const colors = [
    "bg-brand-500",
    "bg-emerald-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-teal-500",
    "bg-cyan-500",
  ];
  const str = name ?? email ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      name,
      email,
      src,
      size = "md",
      fallback,
      className,
      ...props
    },
    ref
  ) => {
    const initials = getInitials(name, email);
    const colorClass = getColorFromName(name, email);

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full overflow-hidden font-semibold text-white select-none",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : fallback ? (
          fallback
        ) : (
          <span className={cn(colorClass)}>{initials}</span>
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  max?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  (
    {
      children,
      max = 5,
      size = "md",
      className,
      ...props
    },
    ref
  ) => {
    const kids = React.Children.toArray(children);
    const visible = kids.slice(0, max);
    const remaining = kids.length - max;

    const overlapClasses = {
      xs: "-ml-1.5",
      sm: "-ml-2",
      md: "-ml-2.5",
      lg: "-ml-3",
      xl: "-ml-4",
    };

    return (
      <div
        ref={ref}
        className={cn("flex items-center", className)}
        {...props}
      >
        {visible.map((child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child as ReactElement<AvatarProps>, {
                key: child.key != null ? child.key : index,
                size,
                className: cn(
                  index > 0 && overlapClasses[size],
                  "ring-2 ring-background",
                  (child.props as AvatarProps)?.className
                ),
              })
            : null
        )}
        {remaining > 0 && (
          <div
            className={cn(
              "flex items-center justify-center rounded-full font-semibold text-text",
              "bg-neutral-100 dark:bg-ink-800",
              "ring-2 ring-background",
              sizeClasses[size],
              overlapClasses[size]
            )}
          >
            +{remaining}
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = "AvatarGroup";