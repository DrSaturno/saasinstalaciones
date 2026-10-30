"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  setNewPassword,
  type ResetPasswordState,
} from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD } from "@/lib/domain/field-rules";

const initialState: ResetPasswordState = { error: null };

export function ResetPasswordForm() {
  const t = useTranslations("ResetPassword");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setNewPassword,
    initialState,
  );

  // La sesión de recuperación sigue abierta después de guardar: no hay por qué
  // volver a pedir la contraseña recién elegida. `/` lo manda el proxy al panel
  // de su rol (el instalador, a sus tareas).
  useEffect(() => {
    if (!state.ok) return;
    const timer = window.setTimeout(() => router.replace("/"), 1500);
    return () => window.clearTimeout(timer);
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground" role="status">
          {t("done")}
        </p>
        <Button
          asChild
          size="lg"
          className="h-12 rounded-xl text-sm font-semibold"
        >
          <Link href="/">{t("goToPanel")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={FIELD.password.min}
          maxLength={FIELD.password.max}
          className="h-12 rounded-xl px-4"
          required
        />
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={FIELD.password.min}
          maxLength={FIELD.password.max}
          className="h-12 rounded-xl px-4"
          required
        />
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-2 h-12 rounded-xl text-sm font-semibold"
      >
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
