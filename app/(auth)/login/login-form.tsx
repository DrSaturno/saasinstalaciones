"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import styles from "./login.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { error: null };

export function LoginForm({
  showPasswordLabel,
  hidePasswordLabel,
}: {
  showPasswordLabel: string;
  hidePasswordLabel: string;
}) {
  const t = useTranslations("Login");
  const common = useTranslations("Common");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const reason = searchParams.get("reason");
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const error =
    state.error ?? (reason === "company_suspended" ? t("companySuspended") : null);

  return (
    <form action={formAction} className={styles.form} aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      <div className={styles.field}>
        <Label className={styles.label} htmlFor="email">
          {common("email")}
        </Label>
        <Input
          className={styles.input}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      <div className={styles.field}>
        <div className={styles.passwordHeader}>
          <Label className={styles.label} htmlFor="password">
            {t("password")}
          </Label>
          <Link
            href="/forgot-password"
            className={styles.forgotPassword}
          >
            {t("forgotPassword")}
          </Link>
        </div>
        <div className={styles.passwordField}>
          <Input
            className={styles.input}
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={passwordVisible ? hidePasswordLabel : showPasswordLabel}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </button>
        </div>
      </div>
      {error ? (
        <p className={styles.error} id="login-error" role="alert">
          <AlertCircle aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className={styles.submit}
      >
        <span>{pending ? t("submitting") : t("submit")}</span>
        <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
