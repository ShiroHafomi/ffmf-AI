"use client";

import { type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LogoMark } from "@/components/ui/Icon";

const FEATURES = [
  {
    titleKey: "auth.feature1Title",
    descKey: "auth.feature1Desc",
  },
  {
    titleKey: "auth.feature2Title",
    descKey: "auth.feature2Desc",
  },
  {
    titleKey: "auth.feature3Title",
    descKey: "auth.feature3Desc",
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
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-50">
      {/* Hero panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
        <div className="brand-gradient absolute inset-0" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 60%, white 0, transparent 35%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <LogoMark className="h-6 w-6" />
          </span>
          <span className="text-lg font-bold tracking-tight">FFMS</span>
        </div>

        <div className="relative">
          <h1 className="max-w-sm text-3xl font-bold leading-tight xl:text-4xl">
            {t("auth.heroHeading")}
          </h1>
          <p className="mt-3 max-w-sm text-sm text-white/80">
            {t("auth.heroSub")}
          </p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.titleKey} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/15 text-xs font-bold">
                  ✓
                </span>
                <div>
                  <p className="text-sm font-semibold">{t(f.titleKey)}</p>
                  <p className="text-xs text-white/70">{t(f.descKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          {t("auth.footer", { year })}
        </p>
      </aside>

      {/* Form side */}
      <main className="flex w-full flex-1 items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl brand-gradient text-white">
                <LogoMark className="h-5 w-5" />
              </span>
              <span className="text-lg font-bold text-ink-900 dark:text-ink-50">FFMS</span>
            </div>
            <LanguageSwitcher className="ml-auto" />
          </div>
          <div className="card card-pad">
            <h2 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{title}</h2>
            <p className="mb-6 mt-1 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
            {children}
          </div>
          <p className="mt-4 text-center text-sm text-ink-500 dark:text-ink-400">{footer}</p>
        </div>
      </main>
    </div>
  );
}
