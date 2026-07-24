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
    projectCount: detail.projects.length, siteCount: detail.sites.length,
  };
  const ordersBySite = new Map<string, typeof detail.orders>();
  for (const order of detail.orders) {
    ordersBySite.set(order.site_id, [...(ordersBySite.get(order.site_id) ?? []), order]);
  }
  return (
    <main className="mx-auto max-w-6xl">
      <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">{t("back")}</Link>
      <header className="mt-4 flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{detail.client.name}</h1><p className="mt-1 text-sm text-muted-foreground">{[detail.client.contact_name, detail.client.email, detail.client.phone].filter(Boolean).join(" · ")}</p></div>
        <ClientDialog client={summary} />
      </header>
      <div className="mt-8 space-y-4">
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
