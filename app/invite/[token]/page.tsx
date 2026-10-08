import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isInstallerArea } from "@/lib/auth";
import { AcceptInvitation } from "@/components/invite/accept-invitation";
import { InstallerSignupForm } from "@/components/invite/installer-signup-form";
import { StaffSignupForm } from "@/components/invite/staff-signup-form";
import { InvitationFrame } from "@/components/invite/invitation-frame";
import { WrongAccountActions } from "@/components/invite/wrong-account-actions";
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

  // Subcuenta de gerente (SUBCTA-*): siempre es un alta de cuenta nueva, no una
  // membresía que se suma a la sesión abierta — igual que el instalador, pero
  // sin el botón «Aceptar» de más abajo, que no aplica a este tipo de alta.
  if (invite.invite_role === "company_staff") {
    if (!user) {
      return (
        <InvitationFrame {...frameProps}>
          <div className={styles.contentHeader}>
            <span>{t("invitationEyebrow")}</span>
            <h1>{t("staffTitle", { company: invite.company_name })}</h1>
            <p>
              {t("staffSignupDescription", { company: invite.company_name })}
            </p>
          </div>
          <div className={styles.formContent}>
            <StaffSignupForm token={token} email={invite.email} />
          </div>
        </InvitationFrame>
      );
    }
    // Con una sesión abierta (casi siempre el dueño que prueba el link): la
    // misma salida que en la invitación de instalador, no un callejón.
    return (
      <InvitationFrame {...frameProps}>
        <div className={styles.contentHeader}>
          <span>{t("invitationEyebrow")}</span>
          <h1>{t("staffTitle", { company: invite.company_name })}</h1>
          <p>
            {user.email
              ? t.rich("staffAlreadyLoggedInWithEmail", {
                  email: user.email,
                  b: (chunks) => <strong>{chunks}</strong>,
                })
              : t("staffAlreadyLoggedIn")}
          </p>
        </div>
        <div className={styles.formContent}>
          <WrongAccountActions token={token} audience="staff" />
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

  // Gerentes y administradores no pueden sumar una membresía de campo. Casi
  // siempre es el propio gerente probando el link: le decimos con qué cuenta
  // entró y le damos salida (copiar el link o cerrar sesión), no un callejón.
  if (!isInstallerArea(user)) {
    return (
      <InvitationFrame {...frameProps}>
        <div className={styles.contentHeader}>
          <span>{t("invitationEyebrow")}</span>
          <h1>{t("title", { company: invite.company_name })}</h1>
          <p>
            {user.email
              ? t.rich("wrongRoleWithEmail", {
                  email: user.email,
                  b: (chunks) => <strong>{chunks}</strong>,
                })
              : t("wrongRole")}
          </p>
        </div>
        <div className={styles.formContent}>
          <WrongAccountActions token={token} />
        </div>
        <p className={styles.accountPrompt}>{t("wrongRoleHint")}</p>
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
