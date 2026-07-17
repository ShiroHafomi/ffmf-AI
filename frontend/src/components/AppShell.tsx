"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { roleLabel, useCan } from "@/lib/permissions";
import { initials } from "@/lib/format";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const NAV = [
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6a1 1 0 001-1V10",
  },
  {
    href: "/insights",
    labelKey: "nav.insights",
    icon: "M3 3v18h18M7 14l4-4 3 3 5-6",
  },
  {
    href: "/expenses",
    labelKey: "nav.expenses",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    href: "/admin",
    labelKey: "admin.nav",
    icon: "M12 2l3 3-3 3-3-3 3-3zM5 11h14v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9z",
    adminOnly: true,
  },
];

const TITLES: Record<string, string> = {
  "/dashboard": "title.dashboard",
  "/insights": "title.insights",
  "/expenses": "title.expenses",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const { household } = useHouseholdData();
  const canFn = useCan();
  const navItems = NAV.filter((i) => !i.adminOnly || canFn("system.admin"));
  const { t } = useLanguage();

  const title = TITLES[pathname] ? t(TITLES[pathname]) : "FFMS";

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl brand-gradient text-white shadow-[var(--shadow-pop)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink-900">FFMS</p>
            <p className="text-[11px] text-ink-400">{t("brand.subtitle")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 ${active ? "text-brand-600" : "text-ink-400"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className="border-t border-ink-200 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(user?.name, user?.email)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-ink-800">{user?.email}</p>
              <p className="truncate text-xs text-ink-400">
                {household?.name ?? t("household.none")}
                {roleLabel(t, user) && (
                  <span className="ml-1 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                    {roleLabel(t, user)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onLogout}
              title={t("common.logout")}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 12H3m0 0l4-4m-4 4l4 4M9 4h8a2 2 0 012 2v12a2 2 0 01-2 2H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Mobile brand */}
              <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white md:hidden">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />
                </svg>
              </span>
              <div>
                <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
                {household?.name && (
                  <p className="hidden text-xs text-ink-400 sm:block">{household.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher className="hidden sm:inline-flex" />
              <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 sm:inline">
                {household?.name ?? t("household.noneYet")}
              </span>
              <button onClick={onLogout} className="btn-ghost btn-sm md:hidden">
                {t("common.logout")}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="mt-3 flex items-center gap-2 overflow-x-auto md:hidden">
            <LanguageSwitcher className="shrink-0" />
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
