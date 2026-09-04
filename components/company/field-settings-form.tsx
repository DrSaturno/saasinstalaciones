"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  updateCompanyFieldSettings,
  type CompanySettingsState,
} from "@/lib/actions/company-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CompanySettingsState = { error: null };

export function FieldSettingsForm({ minCompletionPhotos }: { minCompletionPhotos: number }) {
  const t = useTranslations("Settings");
  const [state, formAction, pending] = useActionState(updateCompanyFieldSettings, initial);

  useEffect(() => {
    if (state.ok) toast.success(t("fieldSaved"));
  }, [state, t]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="min-completion-photos">{t("minCompletionPhotos")}</Label>
        <Input
          id="min-completion-photos"
          name="minCompletionPhotos"
          type="number"
          min="0"
          max="20"
          defaultValue={minCompletionPhotos}
          required
          disabled={pending}
          className="sm:max-w-32"
        />
        <p className="text-xs text-muted-foreground">{t("minCompletionPhotosHelp")}</p>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
