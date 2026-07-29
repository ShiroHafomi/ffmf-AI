"use client";

import { type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LogoMark, Icon } from "@/components/ui/Icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    titleKey: "auth.feature1Title",
    descKey: "auth.feature1Desc",
    icon: "target",
  },
  {
    titleKey: "auth.feature2Title",
    descKey: "auth.feature2Desc",
    icon: "chart",
  },
  {
    titleKey: "auth.feature3Title",
    descKey: "auth.feature3Desc",
    icon: "target",
  },
];

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t, locale } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <div className={cn("flex min-h-screen relative overflow-hidden", "bg-bg")}>
      {/* Animated background */}
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-brand/10 blur-3xl animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cta/10 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] rounded-full bg-warning/10 blur-3xl animate-blob animation-delay-4000" />
        <div className="fixed inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 40 40%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22%23000000%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M0 20L20 0M20 40L40 20M0 0L40 40%22 stroke-width=%220.5%22/%3E%3C/g%3E%3C/svg%22)'] dark:bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 40 40%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.02%22%3E%3Cpath d=%22M0 20L20 0M20 40L40 20M0 0L40 40%22 stroke-width=%220.5%22/%3E%3C/g%3E%3C/svg%22)']" />
      </div>

      {/* Hero panel - left side on desktop */}
      <aside className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-16 relative z-10">
        <div className="flex items-center gap-2.5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft backdrop-blur-sm">
            <LogoMark className="h-7 w-7 text-brand" />
          </span>
          <span className="text-xl font-bold text-text tracking-tight">FFMS</span>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-text xl:text-5xl">
            {t("auth.heroHeading")}
          </h1>
          <p className="mt-4 text-lg text-text-secondary max-w-lg">
            {t("auth.heroSub")}
          </p>
          <ul className="mt-10 space-y-4" role="list" aria-label="Features">
            {FEATURES.map((f) => (
              <li key={f.titleKey} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-brand-text">
                  <Icon name={f.icon as any} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-base font-semibold text-text">{t(f.titleKey)}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{t(f.descKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-4 mt-8">
          <LanguageSwitcher className="shrink-0" />
          <p className="text-sm text-text-muted">
            {t("auth.footer", { year })}
          </p>
        </div>
      </aside>

      {/* Form side - centered on mobile, right side on desktop */}
      <main className="flex w-full flex-1 items-center justify-center p-6 lg:w-1/2 lg:p-10">
        <div className="w-full max-w-md">
          {/* Mobile brand header */}
          <div className="lg:hidden mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft backdrop-blur-sm">
                <LogoMark className="h-6 w-6 text-brand" />
              </span>
              <span className="text-xl font-bold text-text">FFMS</span>
            </div>
            <LanguageSwitcher />
          </div>

          <Card variant="glass" padding="lg" className="w-full">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-text">{title}</CardTitle>
              <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
            </CardHeader>
            <CardContent className="mt-2">
              {children}
            </CardContent>
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-text-muted">{footer}</p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}