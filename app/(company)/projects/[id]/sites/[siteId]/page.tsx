import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { googleMapsHref } from "@/lib/domain/sites";
import { EditSiteDialog } from "@/components/company/edit-site-dialog";
import { SiteLifecycleActions } from "@/components/company/site-lifecycle-actions";
import { SiteFiles } from "@/components/company/site-files";
import { fetchSiteAttachments } from "@/lib/data/site-attachments";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string; siteId: string }> }) {
  const { id: projectId, siteId } = await params;
  const [t, format, user] = await Promise.all([getTranslations("SiteDetail"), getFormatter(), getCurrentUser()]);
  const supabase = await createClient();
  const [{ data: site }, { data: project }, { data: orders }, attachments] = await Promise.all([
    supabase.from("sites").select("id, company_id, name, address, city, state, zone, lat, lng, status, external_ref, archived_at, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes").eq("id", siteId).eq("project_id", projectId).single(),
    supabase.from("projects").select("id, name, country, zones").eq("id", projectId).single(),
    supabase.from("work_orders").select("id, order_number, title, status, scheduled_date, amount, currency, created_at").eq("site_id", siteId).order("created_at", { ascending: false }),
    fetchSiteAttachments(supabase, siteId),
  ]);
  if (!site || !project) notFound();

  const activeOrders = (orders ?? []).filter((order) => order.status !== "cancelada");
  const completed = activeOrders.filter((order) => order.status === "finalizada").length;
  const progress = activeOrders.length ? Math.round((completed / activeOrders.length) * 100) : 0;
  const mapsHref = googleMapsHref(site);
  const mapQuery = site.lat !== null && site.lng !== null ? `${site.lat},${site.lng}` : [site.address, site.city].filter(Boolean).join(", ");
  const mapEmbed = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">{t("back", { project: project.name })}</Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{site.name}</h1><StatusBadge status={site.status} kind="site" />{site.archived_at ? <Badge variant="outline">{t("archived")}</Badge> : null}</div>
          <p className="mt-1 text-sm text-muted-foreground">{site.external_ref ? `${site.external_ref} · ` : ""}{site.zone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditSiteDialog projectId={projectId} siteId={siteId} country={project.country} zones={project.zones} defaults={{ name: site.name, externalRef: site.external_ref ?? "", address: site.address, city: site.city, state: site.state, zone: site.zone, lat: site.lat, lng: site.lng, contactName: site.contact_name, contactPhone: site.contact_phone, contactEmail: site.contact_email, openingHours: site.opening_hours, accessNotes: site.access_notes, parkingNotes: site.parking_notes, technicalNotes: site.technical_notes, riskNotes: site.risk_notes, permanentNotes: site.permanent_notes }} />
          <SiteLifecycleActions projectId={projectId} siteId={siteId} archived={Boolean(site.archived_at)} orderCount={(orders ?? []).length} />
        </div>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-primary" />{t("location")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{[site.address, site.city, site.state].filter(Boolean).join(", ") || t("noAddress")}</p>{mapsHref ? <Button asChild variant="outline" size="sm" className="mt-4"><a href={mapsHref} target="_blank" rel="noreferrer">{t("openMaps")}<ExternalLink /></a></Button> : null}</CardContent>
          {mapEmbed ? <iframe title={t("mapTitle")} src={mapEmbed} className="h-72 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : null}
        </Card>

        <div className="grid gap-4">
          <Card><CardHeader><CardTitle>{t("progress")}</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><span className="font-mono text-4xl font-semibold">{progress}%</span><span className="text-xs text-muted-foreground">{t("completed", { done: completed, total: activeOrders.length })}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${progress}%` }} /></div></CardContent></Card>
          <Card><CardHeader><CardTitle>{t("contact")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{site.contact_name ? <p className="font-medium">{site.contact_name}</p> : null}{site.contact_phone ? <a href={`tel:${site.contact_phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Phone className="size-4" />{site.contact_phone}</a> : null}{site.contact_email ? <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Mail className="size-4" />{site.contact_email}</a> : null}{site.opening_hours ? <p className="text-muted-foreground">{site.opening_hours}</p> : null}</CardContent></Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[{ title: t("access"), value: site.access_notes }, { title: t("parking"), value: site.parking_notes }, { title: t("technical"), value: site.technical_notes }, { title: t("risks"), value: site.risk_notes }, { title: t("permanentNotes"), value: site.permanent_notes }].filter((item) => item.value).map((item) => <Card key={item.title}><CardHeader><CardTitle>{item.title}</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.value}</p></CardContent></Card>)}
      </div>

      <div className="mt-4"><SiteFiles key={attachments.map((attachment) => attachment.id).join(":")} companyId={site.company_id} siteId={site.id} initial={attachments} /></div>

      <section className="mt-9">
        <h2 className="text-lg font-semibold">{t("history")}</h2><p className="text-sm text-muted-foreground">{t("historyDescription")}</p>
        <div className="mt-4 overflow-hidden rounded-xl border bg-card">
          {(orders ?? []).length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyHistory")}</p> : (orders ?? []).map((order) => <Link key={order.id} href={`/orders/${order.id}`} className={`grid gap-2 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:items-center ${user?.role === "company_manager" ? "sm:grid-cols-[130px_1fr_130px_120px]" : "sm:grid-cols-[130px_1fr_130px]"}`}><span className="font-mono text-xs">{order.order_number}</span><div><p className="text-sm font-medium">{order.title}</p><p className="text-xs text-muted-foreground">{format.dateTime(new Date(order.created_at), { dateStyle: "medium" })}</p></div><StatusBadge status={order.status} kind="order" />{user?.role === "company_manager" ? <span className="text-right font-mono text-sm">{order.amount === null ? "—" : format.number(Number(order.amount), { style: "currency", currency: order.currency })}</span> : null}</Link>)}</div>
      </section>
    </div>
  );
}
