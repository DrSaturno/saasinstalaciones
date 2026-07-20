import { createClient } from "@/lib/supabase/server";
import { fetchRoster, fetchPendingInvitations } from "@/lib/data/team";
import { RosterTable } from "@/components/company/roster-table";
import { PendingInvitations } from "@/components/company/pending-invitations";
import { InviteInstallerDialog } from "@/components/company/invite-installer-dialog";

export default async function TeamPage() {
  const supabase = await createClient();
  const [roster, invitations] = await Promise.all([
    fetchRoster(supabase),
    fetchPendingInvitations(supabase),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="mt-1 text-muted-foreground">
            Los instaladores de tu equipo pueden recibir órdenes de trabajo.
          </p>
        </div>
        <InviteInstallerDialog />
      </div>

      <div className="mt-8 flex flex-col gap-8">
        <PendingInvitations invitations={invitations} />
        <RosterTable members={roster} />
      </div>
    </div>
  );
}
