"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signUpInstaller, type SignupState } from "@/lib/actions/invite-signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SignupState = { error: null };

export function InstallerSignupForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const t = useTranslations("Invitation");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    signUpInstaller,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{common("email")}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          readOnly
          disabled
          className="h-12 rounded-xl px-4"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder={t("fullNamePlaceholder")}
          required
          className="h-12 rounded-xl px-4"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-12 rounded-xl px-4"
        />
        <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
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
        {pending ? t("creating") : t("createAccount")}
      </Button>
    </form>
  );
}
