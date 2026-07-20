import Link from "next/link";
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
        <h1 className="text-lg font-medium">Invitación no válida</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El link venció o ya fue usado. Pedile a la empresa que te envíe una
          invitación nueva.
        </p>
      </InvitationFrame>
    );
  }

  // Sin sesión: mandamos a login y volvemos acá tras iniciar sesión.
  if (!user) {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">
          {invite.company_name} te invitó a su equipo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Iniciá sesión con tu cuenta de instalador para aceptar.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href={`/login?next=/invite/${token}`}>Iniciar sesión</Link>
        </Button>
      </InvitationFrame>
    );
  }

  // Logueado con un rol que no es installer.
  if (user.role !== "installer") {
    return (
      <InvitationFrame>
        <h1 className="text-lg font-medium">
          {invite.company_name} te invitó a su equipo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta invitación es para una cuenta de instalador, pero iniciaste sesión
          con otro tipo de cuenta.
        </p>
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame>
      <h1 className="text-lg font-medium">
        {invite.company_name} te invitó a su equipo
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Al unirte vas a poder recibir órdenes de trabajo de esta empresa.
      </p>
      <div className="mt-6">
        <AcceptInvitation token={token} />
      </div>
    </InvitationFrame>
  );
}
