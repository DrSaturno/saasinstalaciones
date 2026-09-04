"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { verifyTotpChallenge } from "@/lib/actions/two-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Paso de verificación: pide el código de 6 dígitos para subir la sesión a
 * AAL2. Lo usa quien ya tiene un factor —en el login o al entrar a un área
 * protegida sin haber pasado el segundo factor.
 */
export function TotpVerify({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations("TwoFactor");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await verifyTotpChallenge({ code });
      if (result.ok) {
        router.replace(redirectTo);
        router.refresh();
      } else {
        setError(result.error ?? t("badCode"));
        setCode("");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("verifyPrompt")}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="totp-code">{t("codeLabel")}</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            setError(null);
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.length === 6) submit();
          }}
          disabled={pending}
          className="font-mono tracking-[0.4em]"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
      </div>
      <Button onClick={submit} disabled={pending || code.length !== 6}>
        {pending ? t("verifying") : t("continue")}
      </Button>
    </div>
  );
}
