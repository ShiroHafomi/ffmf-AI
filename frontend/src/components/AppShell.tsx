"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { roleLabel, useCan } from "@/lib/permissions";
import { initials } from "@/lib/format";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { openCommandPalette } from "@/components/CommandPalette";
import { Icon, LogoMark, type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  labelKey: string;
  icon: IconName;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "home" },
  { href: "/insights", labelKey: "nav.insights", icon: "chart" },
  { href: "/expenses", labelKey: "nav.expenses", icon: "receipt" },
  { href: "/settings", labelKey: "nav.settings", icon: "cog" },
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
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-50">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200 dark:border-ink-800 bg-surface md:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl brand-gradient text-white shadow-pop">
            <LogoMark className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink-900 dark:text-ink-50">FFMS</p>
            <p className="text-[11px] text-ink-400 dark:text-ink-500">{t("brand.subtitle")}</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-soft dark:text-brand-200"
                    : "border-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-100 dark:hover:text-ink-900"
                }`}
              >
                <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-brand-600 dark:text-brand-300" : "text-ink-400 dark:text-ink-500"}`} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className="border-t border-ink-200 dark:border-ink-800 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-soft dark:text-brand-200">
              {initials(user?.name, user?.email)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{user?.email}</p>
              <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                {household?.name ?? t("household.none")}
                {roleLabel(t, user) && (
                  <span className="ml-1 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                    {roleLabel(t, user)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onLogout}
              title={t("common.logout")}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="glass sticky top-0 z-40 border-b border-ink-200 dark:border-ink-800 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white md:hidden">
                <LogoMark className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{title}</h1>
                {household?.name && (
                  <p className="hidden text-xs text-ink-400 dark:text-ink-500 sm:block">{household.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openCommandPalette}
                title={t("cmd.open")}
                className="hidden items-center gap-2 rounded-xl border border-ink-200 dark:border-ink-700 bg-surface px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-100 dark:hover:text-ink-900 sm:inline-flex"
              >
                <Icon name="command" className="h-4 w-4" />
                <span>⌘K</span>
              </button>
              <LanguageSwitcher className="hidden sm:inline-flex" />
              <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-soft dark:text-brand-200 lg:inline">
                {household?.name ?? t("household.noneYet")}
              </span>
              <ThemeToggle />
              <button onClick={openCommandPalette} className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 bg-surface text-ink-600 dark:border-ink-700 dark:text-ink-300 sm:hidden" aria-label={t("cmd.open")}>
                <Icon name="search" className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-ink-200 dark:border-ink-800 bg-surface/95 backdrop-blur md:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active ? "text-brand-600 dark:text-brand-300" : "text-ink-400 dark:text-ink-500"
              }`}
            >
              <Icon name={item.icon} className="h-5 w-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
