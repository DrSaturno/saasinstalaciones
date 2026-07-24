import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AcceptInvitation } from "@/components/invite/accept-invitation";
import { InstallerSignupForm } from "@/components/invite/installer-signup-form";
import { Card, CardContent } from "@/components/ui/card";

function InvitationFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="font-mono text-sm text-muted-foreground">
            Instala Pro
          </Link>
        </div>
        <Card>
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("Invitation");
  const supabase = await createClient();

  const { data: preview } = await supabase.rpc("invitation_preview", {
    p_token: token,
  });
  const invite = Array.isArray(preview) ? preview[0] : null;
  const user = await getCurrentUser();

  // Token inexistente o invitación no válida (vencida/aceptada/cancelada).
  if (!invite || !invite.valid) {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("invalidDescription")}
        </p>
      </InvitationFrame>
    );
  }

  // Sin sesión: primera vez → alta de instalador. Quien ya tenga cuenta usa
  // el link a login (y vuelve acá logueado para ver el botón de aceptar).
  if (!user) {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">
          {t("title", { company: invite.company_name })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("signupDescription")}
        </p>
        <div className="mt-6">
          <InstallerSignupForm token={token} email={invite.email} />
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link
            href={`/login?next=/invite/${token}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("login")}
          </Link>
        </p>
      </InvitationFrame>
    );
  }

  // Logueado con un rol que no es installer.
  if (user.role !== invite.invite_role) {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">
          {t("title", { company: invite.company_name })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("wrongRole")}
        </p>
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame>
      <h1 className="text-lg font-medium">
        {t("title", { company: invite.company_name })}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("joinDescription")}
      </p>
      <div className="mt-6">
        <AcceptInvitation token={token} />
      </div>
    </InvitationFrame>
  );
}
