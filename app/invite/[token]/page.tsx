import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isInstallerArea } from "@/lib/auth";
import { AcceptInvitation } from "@/components/invite/accept-invitation";
import { InstallerSignupForm } from "@/components/invite/installer-signup-form";
import { InvitationFrame } from "@/components/invite/invitation-frame";
import styles from "@/components/invite/invitation.module.css";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [t, common] = await Promise.all([
    getTranslations("Invitation"),
    getTranslations("Common"),
  ]);
  const supabase = await createClient();

  const frameProps = {
    brand: common("brand"),
    visualEyebrow: t("visualEyebrow"),
    visualTitle: t("visualTitle"),
    visualBody: t("visualBody"),
    visualAlt: t("visualAlt"),
    secureAccess: t("secureAccess"),
  };

  const { data: preview } = await supabase.rpc("invitation_preview", {
    p_token: token,
  });
  const invite = Array.isArray(preview) ? preview[0] : null;
  const user = await getCurrentUser();

  // Token inexistente o invitación no válida (vencida/aceptada/cancelada).
  if (!invite || !invite.valid) {
    return (
      <InvitationFrame {...frameProps}>
        <div className={styles.contentHeader}>
          <span>{t("invitationEyebrow")}</span>
          <h1>{t("invalidTitle")}</h1>
          <p>{t("invalidDescription")}</p>
        </div>
      </InvitationFrame>
    );
  }

  // Sin sesión: primera vez → alta de instalador. Quien ya tenga cuenta usa
  // el link a login (y vuelve acá logueado para ver el botón de aceptar).
  if (!user) {
    return (
      <InvitationFrame {...frameProps}>
        <div className={styles.contentHeader}>
          <span>{t("invitationEyebrow")}</span>
          <h1>{t("title", { company: invite.company_name })}</h1>
          <p>{t("signupDescription")}</p>
        </div>
        <div className={styles.formContent}>
          <InstallerSignupForm token={token} email={invite.email} />
        </div>
        <p className={styles.accountPrompt}>
          {t("haveAccount")} {" "}
          <Link
            href={"/login?next=/invite/" + token}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("login")}
          </Link>
        </p>
      </InvitationFrame>
    );
  }

  // Gerentes y administradores no pueden sumar una membresía de campo.
  if (!isInstallerArea(user)) {
    return (
      <InvitationFrame {...frameProps}>
        <div className={styles.contentHeader}>
          <span>{t("invitationEyebrow")}</span>
          <h1>{t("title", { company: invite.company_name })}</h1>
          <p>{t("wrongRole")}</p>
        </div>
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame {...frameProps}>
      <div className={styles.contentHeader}>
        <span>{t("invitationEyebrow")}</span>
        <h1>{t("title", { company: invite.company_name })}</h1>
        <p>{t("joinDescription")}</p>
      </div>
      <div className={styles.formContent}>
        <AcceptInvitation token={token} />
      </div>
    </InvitationFrame>
  );
}
