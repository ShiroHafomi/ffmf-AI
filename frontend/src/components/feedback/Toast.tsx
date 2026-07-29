"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  title?: string;
}

interface ToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

const ICON_FOR: Record<ToastVariant, IconName> = {
  success: "check",
  error: "alert",
  info: "bulb",
  warning: "alert",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, title?: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, variant, message, title }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => remove(id), 4000);
      }
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m, t) => push("success", m, t),
    error: (m, t) => push("error", m, t),
    info: (m, t) => push("info", m, t),
    warning: (m, t) => push("warning", m, t),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[600] flex w-[min(92vw,24rem)] flex-col gap-2 p-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "toast pointer-events-auto fade-in",
              {
                "toast-success": t.variant === "success",
                "toast-warning": t.variant === "warning",
                "toast-danger": t.variant === "error",
                "toast-info": t.variant === "info",
              }
            )}
            role="status"
          >
            <span className="mt-0.5 shrink-0">
              <Icon
                name={ICON_FOR[t.variant]}
                className={cn("h-5 w-5", {
                  "text-success": t.variant === "success",
                  "text-warning": t.variant === "warning",
                  "text-danger": t.variant === "error",
                  "text-info": t.variant === "info",
                })}
              />
            </span>
            <div className="toast-content">
              {t.title && <p className="toast-title">{t.title}</p>}
              <p className="toast-message">{t.message}</p>
            </div>
            <button
              onClick={() => remove(t.id)}
              className="toast-close"
              aria-label="Dismiss"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}