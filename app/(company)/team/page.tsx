import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  fetchPendingInvitations,
  fetchRoster,
  fetchUnavailableInstallers,
} from "@/lib/data/team";
import { fetchCompanyStaff, fetchPendingStaffInvitations } from "@/lib/data/company-staff";
import { RosterTable } from "@/components/company/roster-table";
import { PendingInvitations } from "@/components/company/pending-invitations";
import { InviteInstallerDialog } from "@/components/company/invite-installer-dialog";
import { CompanyStaffPanel } from "@/components/company/company-staff-panel";
import { TeamAvailability } from "@/components/company/team-availability";
import { getCurrentUser } from "@/lib/auth";

export default async function TeamPage() {
  const t = await getTranslations("Team");
  const supabase = await createClient();
  const user = await getCurrentUser();
  const [roster, invitations, unavailable, staff, staffInvitations] = await Promise.all([
    fetchRoster(supabase),
    fetchPendingInvitations(supabase),
    fetchUnavailableInstallers(supabase),
    // Sólo el dueño llega a ver algo acá (SUBCTA-*): la RLS deja a cualquier
    // otra sesión con listas vacías, así que pedirlo siempre es seguro y evita
    // un `if` más antes del `Promise.all`.
    user?.isOwner ? fetchCompanyStaff(supabase, user.companyId ?? "") : Promise.resolve([]),
    user?.isOwner ? fetchPendingStaffInvitations(supabase) : Promise.resolve([]),
  ]);

  // El roster ya trae `roles` por persona: derivar los coordinadores de ahí
  // evita una segunda consulta y una segunda fuente de verdad en esta misma
  // pantalla.
  const coordinators = roster
    .filter((member) => member.status !== "removed" && member.roles.includes("coordinator"))
    .map((member) => ({ id: member.installerId, name: member.name, roles: member.roles }));

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {user?.role === "company_manager" ? <InviteInstallerDialog /> : null}
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {user?.role === "company_manager" ? (
          <PendingInvitations invitations={invitations} />
        ) : null}
        <RosterTable
          members={roster}
          canManageRoles={user?.role === "company_manager"}
        />
        <TeamAvailability
          coordinators={coordinators}
          unavailable={unavailable}
          canReview={user?.role === "company_manager"}
        />
        {user?.isOwner ? (
          <CompanyStaffPanel members={staff} invitations={staffInvitations} />
        ) : null}
      </div>
    </div>
  );
}
