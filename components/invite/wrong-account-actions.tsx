"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, LogOut } from "lucide-react";
import { signOutForInvitation } from "@/lib/actions/invitations";
import { Button } from "@/components/ui/button";
import styles from "./invitation.module.css";

/**
 * Salidas para quien abrió la invitación con una cuenta que no puede aceptarla:
 * cerrar esa sesión y seguir con el alta, o copiar el link para mandárselo al
 * instalador, que es el caso más común (el gerente lo abrió para probarlo).
 */
export function WrongAccountActions({ token }: { token: string }) {
  const t = useTranslations("Invitation");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  // Algunos navegadores (los que se abren dentro de WhatsApp o Instagram, por
  // ejemplo) bloquean el portapapeles: entonces mostramos el link para copiarlo
  // a mano, en vez de dejar a la persona sin salida.
  const [manualLink, setManualLink] = useState<string | null>(null);

  const signOut = () => {
    startTransition(async () => {
      await signOutForInvitation(token);
    });
  };

  const copyLink = async () => {
    const link = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("linkCopied"));
    } catch {
      setManualLink(link);
      toast.error(t("linkCopyFailed"));
    }
  };

  return (
    <div className={styles.actions}>
      <Button onClick={copyLink} className="h-auto min-h-9 w-full whitespace-normal py-2">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("linkCopied") : t("copyLink")}
      </Button>
      {manualLink ? (
        <input
          className={styles.manualLink}
          value={manualLink}
          readOnly
          autoFocus
          aria-label={t("invitationLinkLabel")}
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
      <Button
        variant="outline"
        onClick={signOut}
        disabled={pending}
        className="h-auto min-h-9 w-full whitespace-normal py-2"
      >
        <LogOut aria-hidden />
        {pending ? t("signingOut") : t("signOutAndContinue")}
      </Button>
      <Link href="/" className={styles.backLink}>
        {t("backToPanel")}
      </Link>
    </div>
  );
}
