"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  requestPasswordReset,
  type ResetRequestState,
} from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ResetRequestState = { error: null };

export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPassword");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  // Confirmación deliberadamente ambigua: no dice si el email estaba
  // registrado, para no delatar qué cuentas existen.
  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("sent")}</p>
        <Button asChild variant="secondary" size="lg">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{common("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>
      <Link
        href="/login"
        className="text-center text-sm text-muted-foreground hover:text-primary"
      >
        {t("backToLogin")}
      </Link>
    </form>
  );
}
