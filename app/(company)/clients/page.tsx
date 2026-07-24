import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClients } from "@/lib/data/clients";
import { ClientDialog } from "@/components/company/client-dialog";
import { Card, CardContent } from "@/components/ui/card";

export default async function ClientsPage() {
  const [t, supabase] = await Promise.all([
    getTranslations("Clients"),
    createClient(),
  ]);
  const clients = await fetchClients(supabase);
  return (
    <main className="mx-auto max-w-6xl">
      <header className="flex items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{t("title")}</h1><p className="mt-1 text-muted-foreground">{t("description")}</p></div>
        <ClientDialog />
      </header>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Link key={client.id} href={`/clients/${client.id}`}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="pt-6">
                <h2 className="font-semibold">{client.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{client.contactName || client.email || t("noContact")}</p>
                <div className="mt-5 flex gap-5 font-mono text-sm">
                  <span>{t("projectCount", { count: client.projectCount })}</span>
                  <span>{t("siteCount", { count: client.siteCount })}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!clients.length ? <p className="mt-12 text-center text-sm text-muted-foreground">{t("empty")}</p> : null}
    </main>
  );
}
