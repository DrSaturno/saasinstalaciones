import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AcceptInvitation } from "@/components/invite/accept-invitation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

  // Sin sesión: mandamos a login y volvemos acá tras iniciar sesión.
  if (!user) {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">
          {t("title", { company: invite.company_name })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("loginDescription")}
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href={`/login?next=/invite/${token}`}>{t("login")}</Link>
        </Button>
      </InvitationFrame>
    );
  }

  // Logueado con un rol que no es installer.
  if (user.role !== "installer") {
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
