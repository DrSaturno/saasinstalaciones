import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCanonicalLocationDetail } from "@/lib/data/location-detail";
import { BackLink } from "@/components/shared/back-link";
import { LocationPassport } from "@/components/company/location-passport";
import { LocationConditions } from "@/components/company/location-conditions";
import { LocationProjectHistory } from "@/components/company/location-project-history";
import { LocationEvidenceGallery } from "@/components/company/location-evidence-gallery";
import { LocationIncidents } from "@/components/company/location-incidents";
import { LocationRequirements } from "@/components/company/location-requirements";
import { LocationDocuments } from "@/components/company/location-documents";
import { LocationAuditTrail } from "@/components/company/location-audit-trail";
import { EditSiteDialog } from "@/components/company/edit-site-dialog";

export default async function CanonicalLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([
    getTranslations("CanonicalLocation"),
    createClient(),
  ]);
  const detail = await fetchCanonicalLocationDetail(supabase, id);
  if (!detail) notFound();

  const backHref = detail.client ? `/clients/${detail.client.id}` : "/projects";

  return (
    <main className="mx-auto w-full max-w-[1480px]">
      <BackLink href={backHref} label={detail.client ? t("backToClient", { client: detail.client.name }) : t("backToProjects")} />
      <LocationPassport
        location={detail.location}
        client={detail.client}
        summary={detail.summary}
        action={detail.editContext ? (
          <EditSiteDialog
            projectId={detail.editContext.projectId}
            siteId={detail.editContext.siteId}
            country={detail.editContext.country}
            zones={detail.editContext.zones}
            defaults={{
              name: detail.location.name,
              externalRef: detail.location.external_ref ?? "",
              address: detail.location.address,
              city: detail.location.city,
              state: detail.location.state,
              zone: detail.location.zone,
              lat: detail.location.lat,
              lng: detail.location.lng,
              contactName: detail.location.contact_name,
              contactPhone: detail.location.contact_phone,
              contactEmail: detail.location.contact_email,
              openingHours: detail.location.opening_hours,
              accessNotes: detail.location.access_notes,
              parkingNotes: detail.location.parking_notes,
              technicalNotes: detail.location.technical_notes,
              riskNotes: detail.location.risk_notes,
              permanentNotes: detail.location.permanent_notes,
            }}
          />
        ) : undefined}
      />

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-10">
          <LocationConditions location={detail.location} />
          <LocationProjectHistory projects={detail.projects} />
          <LocationEvidenceGallery items={detail.evidence} />
          <LocationIncidents items={detail.incidents} />
        </div>
        <aside className="space-y-4 xl:sticky xl:top-6">
          <LocationRequirements items={detail.requirements} />
          <LocationDocuments items={detail.documents} />
          <LocationAuditTrail items={detail.events} />
        </aside>
      </div>
    </main>
  );
}
