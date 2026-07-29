"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/feedback/Toast";
import AuthLayout from "@/components/AuthLayout";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await register(email, password, name);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("register.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <>
          {t("register.hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
            {t("register.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="label">
            {t("register.name")}
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("register.namePlaceholder")}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="label">
            {t("register.email")}
          </label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t("register.password")}
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("register.passwordPlaceholder")}
              autoComplete="new-password"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:text-text"
              aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
            >
              <Icon name={showPw ? "eyeOff" : "eye"} className="h-5 w-5" />
            </button>
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full" size="lg">
          {busy ? t("register.submitting") : t("register.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}