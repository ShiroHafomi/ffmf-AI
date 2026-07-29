"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Icon,
  Avatar,
  EmptyState,
} from "@/components/ui";
import { useToast } from "@/components/feedback/Toast";
import { initials } from "@/lib/format";
import { roleLabel } from "@/lib/permissions";

const themeOptions = [
  { value: "light" as const, icon: "sun", labelKey: "theme.light" },
  { value: "dark" as const, icon: "moon", labelKey: "theme.dark" },
  { value: "system" as const, icon: "command", labelKey: "theme.system" },
];

export default function SettingsPage() {
  const { user, logout, updateProfile, changePassword } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const { theme, setTheme, resolved } = useTheme();
  const { household, loadAll } = useHouseholdData();
  const router = useRouter();
  const toast = useToast();

  const [activeSection, setActiveSection] = useState<"profile" | "account" | "appearance" | "language" | "household" | "danger">("profile");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Profile form state
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");

  // Account form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Household form state
  const [householdName, setHouseholdName] = useState(household?.name || "");

  const sections = [
    { id: "profile", labelKey: "settings.profile", icon: "user", href: "#profile" },
    { id: "account", labelKey: "settings.account", icon: "shield", href: "#account" },
    { id: "appearance", labelKey: "settings.appearance", icon: "sun", href: "#appearance" },
    { id: "language", labelKey: "settings.language", icon: "externalLink", href: "#language" },
  ];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving((prev) => ({ ...prev, profile: true }));
    try {
      const res = await updateProfile({ name: profileName.trim(), email: profileEmail.trim() });
      if (res.ok) {
        toast.success(t("toast.profileSaved"));
      } else {
        toast.error((res.data as { error?: string })?.error || t("toast.profileSaveFailed"));
      }
    } catch {
      toast.error(t("toast.profileSaveFailed"));
    } finally {
      setSaving((prev) => ({ ...prev, profile: false }));
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("toast.passwordsMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("toast.passwordTooShort"));
      return;
    }
    setSaving((prev) => ({ ...prev, account: true }));
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.ok) {
        toast.success(t("toast.passwordChanged"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error((res.data as { error?: string })?.error || t("toast.passwordChangeFailed"));
      }
    } catch {
      toast.error(t("toast.passwordChangeFailed"));
    } finally {
      setSaving((prev) => ({ ...prev, account: false }));
    }
  };

  const handleSaveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving((prev) => ({ ...prev, household: true }));
    try {
      if (!household?.id) return;
      // Note: This would need an API endpoint to update household name
      // For now just show success
      toast.success(t("toast.householdSaved"));
    } catch {
      toast.error(t("toast.householdSaveFailed"));
    } finally {
      setSaving((prev) => ({ ...prev, household: false }));
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-display font-bold gradient-text">{t("settings.title")}</h1>
        <p className="text-muted">{t("settings.subtitle")}</p>
      </div>

      {/* Section Navigation Tabs */}
      <Card variant="glass" className="overflow-hidden">
        <nav className="flex flex-wrap gap-1 p-1" role="tablist" aria-label={t("settings.sections")}>
          {sections.map((section, index) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as typeof activeSection)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                activeSection === section.id
                  ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "text-muted hover:text-text dark:hover:text-text"
              }`}
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls={`${section.id}-panel`}
              style={{ transitionDelay: `${index * 50}ms` } as React.CSSProperties}
            >
              <Icon name={section.icon as any} className="h-4 w-4" />
              {t(section.labelKey)}
            </button>
          ))}
        </nav>
      </Card>

      {/* Profile Section */}
      <section id="profile-panel" role="tabpanel" aria-labelledby="profile-tab" className="animate-slide-up" hidden={activeSection !== "profile"}>
        <Card variant="glass" className="card-hover">
          <CardHeader
            title={t("settings.profile")}
            subtitle={t("settings.profileSubtitle")}
            icon={<Icon name="user" className="h-5 w-5" />}
          />
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar
                  size="xl"
                  name={user?.name ?? undefined}
                  email={user?.email}
                  className="ring-2 ring-brand-500/20"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-text">{user?.name || t("common.noData")}</p>
                  <p className="text-sm text-muted">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="brand" size="sm">
                      {roleLabel(t, user)}
                    </Badge>
                    {household?.name && (
                      <Badge tone="neutral" size="sm" className="flex items-center gap-1.5">
                        <Icon name="home" className="h-3 w-3" />
                        {household.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={t("settings.name")}
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={t("settings.namePlaceholder")}
                />
                <Input
                  label={t("settings.email")}
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder={t("settings.emailPlaceholder")}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={() => { setProfileName(user?.name || ""); setProfileEmail(user?.email || ""); }} disabled={saving.profile}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" isLoading={saving.profile}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Account Section - Security */}
      <section id="account-panel" role="tabpanel" aria-labelledby="account-tab" className="animate-slide-up" hidden={activeSection !== "account"}>
        <Card variant="glass" className="card-hover">
          <CardHeader
            title={t("settings.account")}
            subtitle={t("settings.accountSubtitle")}
            icon={<Icon name="shield" className="h-5 w-5" />}
          />
          <CardContent>
            <form onSubmit={handleSaveAccount} className="space-y-6 max-w-md">
              <Input
                label={t("settings.currentPassword")}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
                required
              />
              <Input
                label={t("settings.newPassword")}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
                hint={t("settings.passwordHint")}
                required
              />
              <Input
                label={t("settings.confirmPassword")}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("settings.confirmPasswordPlaceholder")}
                required
              />
              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <Button type="button" variant="ghost" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }} disabled={saving.account}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" isLoading={saving.account}>
                  {t("settings.updatePassword")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Appearance Section */}
      <section id="appearance-panel" role="tabpanel" aria-labelledby="appearance-tab" className="animate-slide-up" hidden={activeSection !== "appearance"}>
        <Card variant="glass" className="card-hover">
          <CardHeader
            title={t("settings.appearance")}
            subtitle={t("settings.appearanceSubtitle")}
            icon={<Icon name="sun" className="h-5 w-5" />}
          />
          <CardContent className="space-y-6">
            <div>
              <label className="label block mb-3">{t("theme.label")}</label>
              <p className="text-sm text-muted mb-4">{t("theme.followSystem")}</p>
              <div className="inline-flex items-center rounded-xl border border-border bg-surface p-1" role="radiogroup" aria-label={t("theme.label")}>
                {themeOptions.map((opt, index) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 min-w-[110px] ${
                      theme === opt.value
                        ? "bg-brand-600 text-white shadow-md"
                        : "text-muted hover:text-text dark:hover:text-text"
                    }`}
                    role="radio"
                    aria-checked={theme === opt.value}
                    aria-label={t(opt.labelKey)}
                    style={{ transitionDelay: `${index * 50}ms` } as React.CSSProperties}
                  >
                    <Icon name={opt.icon as any} className="h-4 w-4 shrink-0" />
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                {t("theme.current", { value: t(`theme.${resolved}`) })}
              </p>
            </div>

            {/* Theme preview cards */}
            <div className="grid gap-4 md:grid-cols-3">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`relative rounded-xl border-2 p-6 text-center transition-all duration-200 ${
                    theme === opt.value
                      ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10"
                      : "border-border bg-surface/50 hover:border-brand-300 dark:hover:border-brand-700"
                  }`}
                  role="radio"
                  aria-checked={theme === opt.value}
                  aria-label={t(opt.labelKey)}
                >
                  <div className="absolute top-2 right-2">
                    {theme === opt.value && (
                      <Icon name="checkCircle" className="h-5 w-5 text-brand-500" />
                    )}
                  </div>
                  <Icon name={opt.icon as any} className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
                  <p className="mt-3 font-medium text-text">{t(opt.labelKey)}</p>
                  <p className="mt-1 text-sm text-muted">{t(`theme.${opt.value}Desc`)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Language Section */}
      <section id="language-panel" role="tabpanel" aria-labelledby="language-tab" className="animate-slide-up" hidden={activeSection !== "language"}>
        <Card variant="glass" className="card-hover">
          <CardHeader
            title={t("settings.language")}
            subtitle={t("settings.languageSubtitle")}
            icon={<Icon name="externalLink" className="h-5 w-5" />}
          />
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text">{locale === "en" ? "English" : "Tiếng Việt"}</p>
                <p className="text-sm text-muted">{t("settings.languageDesc")}</p>
              </div>
              <LanguageSwitcher />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Logout / Danger Zone */}
      <Card variant="glass" className="card-hover border-danger/20">
        <CardHeader
          title={t("settings.dangerZone")}
          subtitle={t("settings.dangerZoneSubtitle")}
          icon={<Icon name="alert" className="h-5 w-5 text-danger" />}
        />
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text">{t("settings.logout")}</p>
              <p className="text-sm text-muted">{t("settings.logoutDesc")}</p>
            </div>
            <Button variant="danger" size="sm" onClick={handleLogout}>
              <Icon name="logout" className="h-4 w-4 mr-2" />
              {t("settings.logout")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}