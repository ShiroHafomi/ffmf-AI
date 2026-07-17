"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

const ICON_FOR: Record<ToastVariant, IconName> = {
  success: "check",
  error: "alert",
  info: "bulb",
};

const STYLE_FOR: Record<ToastVariant, string> = {
  success: "border-l-4 border-emerald-500",
  error: "border-l-4 border-red-500",
  info: "border-l-4 border-brand-500",
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-brand-500",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, variant, message }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => remove(id), 3500);
      }
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border border-ink-200 dark:border-ink-700 bg-surface px-4 py-3 shadow-float fade-in-up ${STYLE_FOR[t.variant]}`}
            role="status"
          >
            <span className={`mt-0.5 shrink-0 ${ICON_COLOR[t.variant]}`}>
              <Icon name={ICON_FOR[t.variant]} className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm text-ink-800 dark:text-ink-100">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200"
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
