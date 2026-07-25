"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { changePassword, type PasswordState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PasswordState = { error: null };

export function ChangePasswordForm() {
  const t = useTranslations("Settings");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(changePassword, initial);

  useEffect(() => {
    if (state.ok) {
      toast.success(t("passwordUpdated"));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? t("saving") : t("changePassword")}
      </Button>
    </form>
  );
}
