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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t("validation.required");
    else if (name.trim().length < 2) newErrors.name = t("validation.nameTooShort");
    if (!email) newErrors.email = t("validation.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = t("validation.invalidEmail");
    if (!password) newErrors.password = t("validation.required");
    else if (password.length < 6) newErrors.password = t("validation.passwordTooShort");
    if (password !== confirmPassword) newErrors.confirmPassword = t("validation.passwordsMismatch");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await register(email, password, name.trim());
      toast.success(t("toast.registerSuccess"));
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
          <Link
            href="/login"
            className="font-semibold text-brand hover:text-brand-hover dark:text-brand-text dark:hover:text-brand-hover transition-colors"
          >
            {t("register.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6 fade-in-up stagger" noValidate>
        <div style={{ animationDelay: "0ms" }}>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder={t("register.namePlaceholder")}
            autoComplete="name"
            required
            label={t("register.name")}
            error={errors.name}
            hint={t("register.nameHint")}
            aria-describedby={errors.name ? "name-error" : "name-hint"}
            aria-invalid={errors.name ? "true" : "false"}
          />
        </div>

        <div style={{ animationDelay: "50ms" }}>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
            }}
            placeholder="you@example.com"
            autoComplete="email"
            label={t("register.email")}
            error={errors.email}
            hint={t("register.emailHint")}
            aria-describedby={errors.email ? "email-error" : "email-hint"}
            aria-invalid={errors.email ? "true" : "false"}
          />
        </div>

        <div style={{ animationDelay: "100ms" }}>
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            placeholder={t("register.passwordPlaceholder")}
            autoComplete="new-password"
            className="pr-12"
            label={t("register.password")}
            error={errors.password}
            hint={t("register.passwordHint")}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
            aria-invalid={errors.password ? "true" : "false"}
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

        <div style={{ animationDelay: "150ms" }}>
          <Input
            id="confirmPassword"
            type={showPw ? "text" : "password"}
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            placeholder={t("register.confirmPasswordPlaceholder")}
            autoComplete="new-password"
            className="pr-12"
            label={t("register.confirmPassword")}
            error={errors.confirmPassword}
            hint={t("register.confirmPasswordHint")}
            aria-describedby={errors.confirmPassword ? "confirm-error" : "confirm-hint"}
            aria-invalid={errors.confirmPassword ? "true" : "false"}
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

        <Button
          type="submit"
          disabled={busy}
          className="w-full"
          size="lg"
          isLoading={busy}
          variant="cta"
        >
          {t("register.submit")}
        </Button>

        <p className="text-center text-sm text-text-muted" aria-live="polite">
          {busy && t("register.submitting")}
        </p>

        <p className="text-xs text-text-muted text-center" style={{ animationDelay: "200ms" }}>
          {t("register.termsAgreement")}
        </p>
      </form>
    </AuthLayout>
  );
}