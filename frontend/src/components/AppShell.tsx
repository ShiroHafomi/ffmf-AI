"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { roleLabel, useCan } from "@/lib/permissions";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { openCommandPalette } from "@/components/CommandPalette";
import { Icon, LogoMark, type IconName } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: IconName;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "layoutDashboard" },
  { href: "/insights", labelKey: "nav.insights", icon: "barChart" },
  { href: "/expenses", labelKey: "nav.expenses", icon: "receipt" },
  { href: "/settings", labelKey: "nav.settings", icon: "settings" },
  { href: "/admin", labelKey: "admin.nav", icon: "users", adminOnly: true },
];

const TITLES: Record<string, string> = {
  "/dashboard": "title.dashboard",
  "/insights": "title.insights",
  "/expenses": "title.expenses",
  "/settings": "nav.settings",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const { household } = useHouseholdData();
  const canFn = useCan();
  const { t } = useLanguage();

  const navItems = NAV.filter((i) => !i.adminOnly || canFn("system.admin"));
  const title = TITLES[pathname] ? t(TITLES[pathname]) : "FFMS";

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className={cn("flex min-h-screen", "bg-bg")}>
      {/* Sidebar (desktop) */}
      <aside className={cn(
        "sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border",
        "bg-surface/80 backdrop-blur-xl md:flex"
      )}>
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-5 py-5"
          aria-label="FFMS Home"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 backdrop-blur-sm">
            <LogoMark className="h-6 w-6 text-brand" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-text">FFMS</p>
            <p className="text-[11px] text-muted">{t("brand.subtitle")}</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand bg-brand-soft text-brand-text dark:bg-brand-soft/20 dark:text-brand-text"
                    : "border-transparent text-text-muted hover:bg-surface-hover hover:text-text"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  name={item.icon}
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active
                      ? "text-brand"
                      : "text-muted"
                  )}
                  aria-hidden="true"
                />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className="border-t border-border p-3 bg-surface/50">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar
              name={user?.name ?? ""}
              email={user?.email ?? ""}
              size="sm"
              className="bg-brand-soft text-brand-text dark:bg-brand-soft/30 dark:text-brand-text"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-text">{user?.email}</p>
              <p className="truncate text-xs text-muted flex items-center gap-1.5">
                {household?.name ?? t("household.none")}
                {roleLabel(t, user) && (
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    "bg-surface-hover text-text-muted"
                  )}>
                    {roleLabel(t, user)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onLogout}
              title={t("common.logout")}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors",
                "hover:bg-surface-hover hover:text-text"
              )}
              aria-label={t("common.logout")}
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className={cn(
          "glass-panel sticky top-0 z-sticky border-b border-border px-4 py-3 sm:px-6"
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cn(
                "grid h-8 w-8 place-items-center rounded-lg bg-brand/10 backdrop-blur-sm md:hidden"
              )}>
                <LogoMark className="h-5 w-5 text-brand" />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-text">{title}</h1>
                {household?.name && (
                  <p className="hidden text-xs text-muted sm:block">{household.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openCommandPalette}
                title={t("cmd.open")}
                className={cn(
                  "hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 min-h-[44px] min-w-[44px]",
                  "text-xs font-medium text-muted transition-colors",
                  "hover:bg-surface-hover hover:text-text sm:inline-flex"
                )}
              >
                <Icon name="command" className="h-4 w-4" />
                <kbd className="hidden px-1.5 py-0.5 rounded bg-surface-hover text-xs font-mono text-muted">{'⌘K'}</kbd>
              </button>
              <LanguageSwitcher className="hidden sm:inline-flex" />
              <span className={cn(
                "hidden rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-text",
                "lg:inline"
              )}>
                {household?.name ?? t("household.noneYet")}
              </span>
              <NotificationBell />
              <ThemeToggle />
              <button
                onClick={openCommandPalette}
                className={cn(
                  "grid h-9 w-9 min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-border bg-surface",
                  "text-muted sm:hidden"
                )}
                aria-label={t("cmd.open")}
              >
                <Icon name="search" className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-popover flex items-stretch justify-around border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Bottom navigation">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-brand" : "text-muted"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} className="h-5 w-5" aria-hidden="true" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}