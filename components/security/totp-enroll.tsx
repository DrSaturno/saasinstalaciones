"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  confirmTotpEnrollment,
  startTotpEnrollment,
} from "@/lib/actions/two-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Enrolamiento de TOTP: muestra el QR + el secreto y pide el primer código
 * para confirmar. Al confirmar, la sesión sube a AAL2 y se sigue a `redirectTo`.
 *
 * `required` cambia el copy (obligatorio vs opcional) y oculta el "cancelar":
 * un gerente que llega acá forzado no tiene a dónde volver sin enrolar.
 */
export function TotpEnroll({
  redirectTo,
  required,
}: {
  redirectTo: string;
  required: boolean;
}) {
  const t = useTranslations("TwoFactor");
  const router = useRouter();
  const [enroll, setEnroll] = useState<
    { factorId: string; qrCode: string; secret: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [starting, startStart] = useTransition();
  const [confirming, startConfirm] = useTransition();

  // El factor se crea al abrir la pantalla: el QR tiene que estar listo cuando
  // la persona abre su app de autenticación.
  useEffect(() => {
    startStart(async () => {
      const result = await startTotpEnrollment();
      if (result.ok) setEnroll(result);
      else setError(result.error);
    });
  }, []);

  const confirm = () => {
    if (!enroll) return;
    startConfirm(async () => {
      const result = await confirmTotpEnrollment({ factorId: enroll.factorId, code });
      if (result.ok) {
        toast.success(t("enrolledOk"));
        router.replace(redirectTo);
        router.refresh();
      } else {
        setError(result.error ?? t("badCode"));
      }
    });
  };

  if (starting && !enroll) {
    return <p className="text-sm text-muted-foreground">{t("preparing")}</p>;
  }
  if (error && !enroll) {
    return <p className="text-sm text-destructive" role="alert">{error}</p>;
  }
  if (!enroll) return null;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
      </ol>

      {/* El QR viene como data-URI SVG desde Supabase; se muestra tal cual. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enroll.qrCode}
        alt={t("qrAlt")}
        className="mx-auto size-48 rounded-xl border bg-white p-2"
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("manualEntry")}</span>
        <code className="select-all break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
          {enroll.secret}
        </code>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="totp-code">{t("codeLabel")}</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            setError(null);
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          disabled={confirming}
          className="font-mono tracking-[0.4em]"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button onClick={confirm} disabled={confirming || code.length !== 6} className="flex-1">
          {confirming ? t("verifying") : t("activate")}
        </Button>
        {!required ? (
          <Button variant="outline" onClick={() => router.back()} disabled={confirming}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
