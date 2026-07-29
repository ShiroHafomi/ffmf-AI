"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";

interface Notification {
  id: number;
  user_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

type TabKey = "all" | "unread";

export function NotificationBell() {
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(
    async (filterUnread = false) => {
      setLoading(true);
      try {
        const path = `/api/notifications${filterUnread ? "?unread=true" : ""}`;
        const res = await authFetch<{ notifications: Notification[] }>(path);
        if (res.ok && res.data && Array.isArray(res.data.notifications)) {
          setNotifications(res.data.notifications);
          const unread = res.data.notifications.filter((n) => !n.is_read).length;
          setUnreadCount(unread);
        }
      } catch (e) {
        console.error("Failed to load notifications:", e);
      } finally {
        setLoading(false);
      }
    },
    [authFetch],
  );

  // Load on mount
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => loadNotifications(), 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id: number) => {
    try {
      const res = await authFetch(`/api/notifications/${id}/read`, { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Call mark-read for each unread notification
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      await Promise.all(unreadIds.map((id) => authFetch(`/api/notifications/${id}/read`, { method: "PUT" })));
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error("Failed to mark all as read:", e);
    }
  };

  const filteredNotifications = notifications.filter(
    (n) => activeTab === "all" || !n.is_read,
  );

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button in topbar */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-label={t("notifications.title") ?? "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface shadow-float animate-fade-in z-popover"
          role="menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold text-text">{t("notifications.title")}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("unread")}
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded transition-colors",
                  activeTab === "unread"
                    ? "bg-brand-soft text-brand-text dark:bg-brand-soft/30 dark:text-brand-text"
                    : "text-muted hover:text-text hover:bg-surface-hover"
                )}
              >
                {t("notifications.unread", { n: unreadCount })}
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded transition-colors",
                  activeTab === "all"
                    ? "bg-brand-soft text-brand-text dark:bg-brand-soft/30 dark:text-brand-text"
                    : "text-muted hover:text-text hover:bg-surface-hover"
                )}
              >
                {t("notifications.tabAll")}
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-muted">
                {activeTab === "unread"
                  ? t("notifications.emptyHint")
                  : t("notifications.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border" role="list">
                {filteredNotifications.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "px-4 py-3 hover:bg-surface-hover transition-colors",
                      !n.is_read && "bg-brand-soft/30 dark:bg-brand-soft/10",
                    )}
                    role="menuitem"
                    tabIndex={-1}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex-shrink-0 h-2 w-2 rounded-full",
                          n.is_read
                            ? "bg-transparent border border-border"
                            : "bg-brand",
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm text-text", !n.is_read && "font-medium")}>
                          {n.message}
                        </p>
                        <p className="mt-1 text-[11px] text-text-muted">{fmtDate(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mr-2 p-1"
                          onClick={() => markAsRead(n.id)}
                          aria-label={t("notifications.markAsRead")}
                        >
                          <Icon name="check" className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer - Mark all as read */}
          {unreadCount > 0 && (
            <div className="border-t border-border px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={markAllAsRead}
                disabled={loading}
              >
                {t("notifications.markAllRead")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}