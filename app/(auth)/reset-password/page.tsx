import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "./reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { InvitationFrame } from "@/components/invite/invitation-frame";
import styles from "@/components/invite/invitation.module.css";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [t, common, searchParams, supabase] = await Promise.all([
    getTranslations("ResetPassword"),
    getTranslations("Common"),
    props.searchParams,
    createClient(),
  ]);

  // El link de recuperación o invitación abre una sesión antes de llegar acá.
  // Sin ella no hay nada que acredite quién es: puede haber vencido, ya haberse
  // usado o ser un PKCE abierto fuera del navegador que inició el pedido.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const invalid = Boolean(searchParams.error) || !user;

  // Mismo marco que la invitación: la persona llega desde un mail y ve la
  // misma escena y la misma marca en cada paso del acceso.
  return (
    <InvitationFrame
      brand={common("brand")}
      visualEyebrow={t("visualEyebrow")}
      visualTitle={t("visualTitle")}
      visualBody={t("visualBody")}
      visualAlt={t("visualAlt")}
      secureAccess={t("secureAccess")}
    >
      <div className={styles.contentHeader}>
        <span>{t("eyebrow")}</span>
        <h1>{invalid ? t("invalidLink") : t("title")}</h1>
        <p>{invalid ? t("invalidLinkDescription") : t("description")}</p>
      </div>
      <div className={styles.formContent}>
        {invalid ? (
          <div className={styles.actions}>
            <Button asChild size="lg">
              <Link href="/forgot-password">{t("requestNew")}</Link>
            </Button>
          </div>
        ) : (
          <ResetPasswordForm />
        )}
      </div>
    </InvitationFrame>
  );
}
