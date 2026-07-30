import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClientDetail } from "@/lib/data/clients";
import { ClientDialog } from "@/components/company/client-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getTranslations("Clients"), createClient()]);
  const detail = await fetchClientDetail(supabase, id);
  if (!detail) notFound();
  const summary = {
    id: detail.client.id, name: detail.client.name, taxId: detail.client.tax_id,
    contactName: detail.client.contact_name, email: detail.client.email,
    phone: detail.client.phone, address: detail.client.address, notes: detail.client.notes,
    website: detail.client.website, instagram: detail.client.instagram,
    youtube: detail.client.youtube, tiktok: detail.client.tiktok,
    projectCount: detail.projects.length, siteCount: detail.sites.length,
  };
  const ordersBySite = new Map<string, typeof detail.orders>();
  for (const order of detail.orders) {
    ordersBySite.set(order.site_id, [...(ordersBySite.get(order.site_id) ?? []), order]);
  }
  return (
    <main className="mx-auto w-full max-w-[1480px]">
      <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">{t("back")}</Link>
      <header className="mt-4 flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{detail.client.name}</h1><p className="mt-1 text-sm text-muted-foreground">{t("summary", { projects: summary.projectCount, sites: summary.siteCount })}</p></div>
        <ClientDialog client={summary} />
      </header>

      <Card className="mt-6">
        <CardHeader className="border-b"><CardTitle>{t("dataTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("contactName")} value={detail.client.contact_name} />
          <Field label={t("taxId")} value={detail.client.tax_id} mono />
          <Field label={t("phone")} value={detail.client.phone} mono />
          <Field label={t("email")} value={detail.client.email} />
          <Field label={t("address")} value={detail.client.address} />
          <LinkField label={t("website")} value={detail.client.website} />
          <LinkField label={t("instagram")} value={detail.client.instagram} base="https://instagram.com/" />
          <LinkField label={t("youtube")} value={detail.client.youtube} base="https://youtube.com/" />
          <LinkField label={t("tiktok")} value={detail.client.tiktok} base="https://tiktok.com/@" />
          {detail.client.notes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("notes")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{detail.client.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("sitesTitle")}</h2>
      <div className="mt-3 space-y-4">
        {detail.sites.map((site) => (
          <Card key={site.id}>
            <CardHeader><CardTitle><Link href={`/projects/${site.project_id}/sites/${site.id}`} className="hover:text-primary">{site.name}</Link></CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{[site.address, site.city, site.state, site.zone].filter(Boolean).join(" · ")}</p>
              <div className="mt-4 space-y-2">
                {(ordersBySite.get(site.id) ?? []).map((order) => (
                  <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:border-primary/30">
                    <span><span className="font-mono">{order.order_number}</span> · {order.title}</span>
                    <StatusBadge status={order.status} />
                  </Link>
                ))}
                {!(ordersBySite.get(site.id)?.length) ? <p className="text-xs text-muted-foreground">{t("noOrders")}</p> : null}
              </div>
            </CardContent>
          </Card>
        ))}
        {!detail.sites.length ? <p className="text-sm text-muted-foreground">{t("noSites")}</p> : null}
      </div>
    </main>
  );
}

/**
 * Presencia online, como link cuando se puede.
 *
 * El campo es texto libre —hay quien escribe "@lamarca", quien pega la URL
 * entera y quien pone "instagram.com/lamarca"— así que acá se arma el link con
 * lo que haya: si ya trae protocolo se respeta, si no se le antepone la base de
 * la red. Vale más un link que a veces no resuelve que obligar a escribir la
 * URL canónica al cargar el cliente.
 */
function LinkField({ label, value, base = "https://" }: { label: string; value: string; base?: string }) {
  if (!value) return <Field label={label} value="" />;
  const href = /^https?:\/\//i.test(value)
    ? value
    : `${base}${value.replace(/^@/, "")}`;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1 block truncate text-sm text-primary hover:underline"
      >
        {value}
      </a>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate ${mono ? "font-mono text-sm" : "text-sm"}`}>{value || "—"}</p>
    </div>
  );
}
