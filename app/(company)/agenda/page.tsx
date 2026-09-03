import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { fetchCompanyAgenda } from "@/lib/data/agenda";
import { defaultAgendaDateFrom } from "@/lib/domain/agenda";
import { AgendaTable } from "@/components/company/agenda-table";

export default async function AgendaPage() {
  const supabase = await createClient();
  const [t, rows] = await Promise.all([
    getTranslations("Agenda"),
    fetchCompanyAgenda(supabase),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <div className="mt-8">
        <AgendaTable rows={rows} defaultDateFrom={defaultAgendaDateFrom(new Date())} />
      </div>
    </div>
  );
}
