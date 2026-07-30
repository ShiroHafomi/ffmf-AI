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
          <Link href="/login" className="font-semibold text-brand hover:text-brand-hover dark:text-brand-text dark:hover:text-brand-text transition-colors">
            {t("register.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="name" className="label">
            {t("register.name")}
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => { setName(e.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: "" })); }}
            placeholder={t("register.namePlaceholder")}
            autoComplete="name"
            required
            aria-describedby={errors.name ? "name-error" : "name-hint"}
            aria-invalid={errors.name ? "true" : "false"}
            error={errors.name}
          />
          {errors.name && <p id="name-error" className="form-error" role="alert">{errors.name}</p>}
          <p id="name-hint" className="form-hint">{t("register.nameHint")}</p>
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
            onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: "" })); }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-describedby={errors.email ? "email-error" : "email-hint"}
            aria-invalid={errors.email ? "true" : "false"}
            error={errors.email}
          />
          {errors.email && <p id="email-error" className="form-error" role="alert">{errors.email}</p>}
          <p id="email-hint" className="form-hint">{t("register.emailHint")}</p>
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
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: "" })); if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: "" })); }}
              placeholder={t("register.passwordPlaceholder")}
              autoComplete="new-password"
              className="pr-12"
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              aria-invalid={errors.password ? "true" : "false"}
              error={errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
              aria-pressed={showPw}
            >
              <Icon name={showPw ? "eyeOff" : "eye"} className="h-5 w-5" />
            </button>
          </div>
          {errors.password && <p id="password-error" className="form-error" role="alert">{errors.password}</p>}
          <p id="password-hint" className="form-hint">{t("register.passwordHint")}</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">
            {t("register.confirmPassword")}
          </label>
          <Input
            id="confirmPassword"
            type={showPw ? "text" : "password"}
            required
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: "" })); }}
            placeholder={t("register.confirmPasswordPlaceholder")}
            autoComplete="new-password"
            aria-describedby={errors.confirmPassword ? "confirm-error" : "confirm-hint"}
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            error={errors.confirmPassword}
          />
          {errors.confirmPassword && <p id="confirm-error" className="form-error" role="alert">{errors.confirmPassword}</p>}
          <p id="confirm-hint" className="form-hint">{t("register.confirmPasswordHint")}</p>
        </div>

        <Button type="submit" disabled={busy} className="w-full" size="lg" isLoading={busy}>
          {t("register.submit")}
        </Button>

        <p className="text-center text-sm text-text-muted" aria-live="polite">
          {busy && t("register.submitting")}
        </p>
      </form>
    </AuthLayout>
  );
}