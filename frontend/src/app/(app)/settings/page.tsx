"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/components/feedback/Toast";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Card, CardHeader, Icon } from "@/components/ui";
import { initials } from "@/lib/format";
import { roleLabel } from "@/lib/permissions";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { household } = useHouseholdData();
  const toast = useToast();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  const themeOptions: { value: "light" | "dark" | "system"; icon: "sun" | "moon" | "command" }[] = [
    { value: "light", icon: "sun" },
    { value: "dark", icon: "moon" },
    { value: "system", icon: "command" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 fade-in-up">
      <div>
        <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{t("settings.title")}</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t("settings.subtitle")}</p>
      </div>

      {/* Profile */}
      <Card className="card-pad card-hover">
        <CardHeader title={t("settings.profile")} icon={<Icon name="users" />} />
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-soft dark:text-brand-200">
            {initials(user?.name, user?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink-900 dark:text-ink-50">
              {user?.name || user?.email}
            </p>
            <p className="truncate text-sm text-ink-500 dark:text-ink-400">{user?.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="badge-brand">{roleLabel(t, user)}</span>
              {household?.name && (
                <span className="badge-neutral">{household.name}</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="card-pad card-hover">
        <CardHeader title={t("settings.appearance")} icon={<Icon name="sun" />} />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{t("theme.label")}</p>
              <p className="text-xs text-ink-400 dark:text-ink-500">{t("theme.followSystem")}</p>
            </div>
            <div className="inline-flex items-center rounded-xl border border-ink-200 dark:border-ink-700 bg-surface p-1">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    theme === opt.value
                      ? "bg-brand-600 text-white"
                      : "text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
                  }`}
                  aria-pressed={theme === opt.value}
                >
                  <Icon name={opt.icon} className="h-4 w-4" />
                  {t(`theme.${opt.value}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Language */}
      <Card className="card-pad card-hover">
        <CardHeader title={t("settings.language")} />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-500 dark:text-ink-400">{t("settings.language")}</p>
          <LanguageSwitcher />
        </div>
      </Card>

      {/* Logout */}
      <Card className="card-pad card-hover">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{t("settings.logout")}</p>
            <p className="text-xs text-ink-400 dark:text-ink-500">{t("settings.signedInAs")} {user?.email}</p>
          </div>
          <button onClick={onLogout} className="btn-danger">
            <Icon name="logout" className="h-4 w-4" />
            {t("settings.logout")}
          </button>
        </div>
      </Card>
    </div>
  );
}
