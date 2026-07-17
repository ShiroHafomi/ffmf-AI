"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { HouseholdDataProvider } from "@/context/HouseholdDataContext";
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-50">
        <div className="flex items-center gap-3 text-ink-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
          <span className="text-sm">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <HouseholdDataProvider>
      <AppShell>{children}</AppShell>
    </HouseholdDataProvider>
  );
}
