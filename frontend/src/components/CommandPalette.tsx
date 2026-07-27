"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useCan } from "@/lib/permissions";
import { Icon, type IconName } from "@/components/ui/Icon";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
  group: string;
}

export function openCommandPalette() {
  window.dispatchEvent(new Event("ffms:open-command"));
}

export default function CommandPalette() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { toggle: toggleTheme } = useTheme();
  const canFn = useCan();
  const canAdmin = canFn("system.admin");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global shortcut + external open trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("ffms:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ffms:open-command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Reset state + focus after paint (avoids synchronous setState-in-effect).
      requestAnimationFrame(() => {
        setQuery("");
        setActive(0);
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const items = useMemo<CmdItem[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const nav: CmdItem[] = [
      { id: "nav-dash", label: t("nav.dashboard"), icon: "home", run: go("/dashboard"), group: t("cmd.groupNav") },
      { id: "nav-ins", label: t("nav.insights"), icon: "chart", run: go("/insights"), group: t("cmd.groupNav") },
      { id: "nav-exp", label: t("nav.expenses"), icon: "receipt", run: go("/expenses"), group: t("cmd.groupNav") },
      { id: "nav-set", label: t("nav.settings"), icon: "cog", run: go("/settings"), group: t("cmd.groupNav") },
    ];
    if (canAdmin) {
      nav.push({ id: "nav-admin", label: t("admin.nav"), icon: "users", run: go("/admin"), group: t("cmd.groupNav") });
    }
    const actions: CmdItem[] = [
      {
        id: "act-theme",
        label: t("cmd.toggleTheme"),
        icon: "moon",
        run: () => {
          setOpen(false);
          toggleTheme();
        },
        group: t("cmd.groupActions"),
      },
      {
        id: "act-logout",
        label: t("common.logout"),
        icon: "logout",
        hint: t("nav.dashboard"),
        run: () => {
          setOpen(false);
          logout().finally(() => router.push("/login"));
        },
        group: t("cmd.groupActions"),
      },
    ];
    return [...nav, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  function highlight(text: string, query: string) {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.trim());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-brand-200 text-brand-900 dark:bg-brand-900/40 dark:text-brand-200 rounded px-0.5">
          {text.slice(idx, idx + query.trim().length)}
        </mark>
        {text.slice(idx + query.trim().length)}
      </>
    );
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
    });
    return () => cancelAnimationFrame(id);
  }, [filtered.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-700 bg-surface shadow-float fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("cmd.title")}
      >
        <div className="flex items-center gap-3 border-b border-ink-100 dark:border-ink-800 px-4">
          <span className="text-ink-500 dark:text-ink-400">
            <Icon name="search" className="h-5 w-5" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("cmd.placeholder")}
            className="w-full bg-transparent py-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:placeholder:text-ink-400 dark:text-ink-900"
          />
          <kbd className="hidden rounded-md border border-ink-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 sm:block dark:border-ink-700 dark:text-ink-400">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-400">{t("cmd.noResults")}</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onMouseEnter={() => setActive(i)}
                onClick={item.run}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  i === active
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-soft dark:text-brand-200"
                    : "text-ink-700 dark:text-ink-200"
                }`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                  <Icon name={item.icon} className="h-4 w-4" />
                </span>
                <span className="flex-1 font-medium">{highlight(item.label, query)}</span>
                {i === active && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    ↵
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
