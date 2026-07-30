"use client";

import { type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LogoMark, Icon, type IconName } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const FEATURES = [
  { titleKey: "auth.feature1Title", descKey: "auth.feature1Desc", icon: "target" as IconName },
  { titleKey: "auth.feature2Title", descKey: "auth.feature2Desc", icon: "chart" as IconName },
  { titleKey: "auth.feature3Title", descKey: "auth.feature3Desc", icon: "shield" as IconName },
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

  return (
    <div className={cn("flex min-h-screen relative", "bg-bg")}>
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        {t("common.skipToContent")}
      </a>

      {/* Animated background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-brand/10 blur-3xl animate-blob"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cta/10 blur-3xl animate-blob"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-[500px] h-[500px] rounded-full bg-warning/10 blur-3xl animate-blob"
          style={{ animationDelay: "4s" }}
        />

        {/* Grid pattern overlay */}
        <div
          className="fixed inset-0 bg-grid-pattern opacity-30 dark:opacity-10"
          style={{
            backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <main id="main-content" className="flex w-full flex-col items-center justify-center p-4 py-12 md:py-20">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <LogoMark className="h-10 w-10 text-brand" aria-hidden="true" />
            <span className="text-display font-bold text-text">FFMS</span>
          </div>

          {/* Feature highlights on desktop */}
          <div className="hidden lg:grid grid-cols-3 gap-4 mb-8 text-center">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.icon}
                className="card card-padded card-hover glass-card p-4 text-center"
                style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
                  <Icon name={feature.icon} className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-text">{t(feature.titleKey)}</p>
                <p className="text-xs text-text-muted mt-1">{t(feature.descKey)}</p>
              </div>
            ))}
          </div>

          {/* Main form card - Glassmorphism */}
          <Card variant="glass" className="card-hover">
            <CardContent className="pt-6 pb-8">
              <header className="text-center mb-8">
                <h1 className="text-display font-bold text-text mb-2">{title}</h1>
                <p className="text-text-secondary">{subtitle}</p>
              </header>

              {children}

              <footer className="mt-6 pt-4 border-t border-border/50 text-center">
                <p className="text-sm text-text-muted">{footer}</p>
              </footer>
            </CardContent>
          </Card>

          {/* Footer links */}
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-text-muted">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <span className="text-xs">{t("common.copyright", { year: new Date().getFullYear() })}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}