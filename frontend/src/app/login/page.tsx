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

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = t("validation.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = t("validation.invalidEmail");
    if (!password) newErrors.password = t("validation.required");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email, password);
      toast.success(t("toast.loginSuccess"));
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-brand hover:text-brand-hover dark:text-brand-text dark:hover:text-brand-hover transition-colors"
          >
            {t("login.createOne")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6 fade-in-up stagger" noValidate>
        <Input
          id="email"
          type="email"
          label={t("login.email")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
          }}
          placeholder="you@example.com"
          autoComplete="email"
          required
          aria-describedby={errors.email ? "email-error" : "email-hint"}
          aria-invalid={errors.email ? "true" : "false"}
          error={errors.email}
          hint={t("login.emailHint")}
          style={{ animationDelay: "0ms" }}
        />

        <div style={{ animationDelay: "50ms" }}>
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            label={t("login.password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="pr-12"
            error={errors.password}
            hint={t("login.passwordHint")}
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors"
            aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
            aria-pressed={showPw}
          >
            <Icon name={showPw ? "eyeOff" : "eye"} className="h-5 w-5" />
          </button>
        </div>

        <Button type="submit" disabled={busy} className="w-full" size="lg" isLoading={busy} variant="cta">
          {t("login.submit")}
        </Button>

        <p className="text-center text-sm text-text-muted" aria-live="polite">
          {busy && t("login.submitting")}
        </p>

        <p className="text-center text-xs text-text-muted">
          <Link
            href="/forgot-password"
            className="text-brand hover:text-brand-hover dark:text-brand-text dark:hover:text-brand-hover transition-colors"
          >
            {t("login.forgotPassword")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}