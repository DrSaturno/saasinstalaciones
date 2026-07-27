import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClients } from "@/lib/data/clients";
import { ClientDialog } from "@/components/company/client-dialog";
import { ClientsView } from "@/components/company/clients-view";

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
      <ClientsView clients={clients} />
    </main>
  );
}
