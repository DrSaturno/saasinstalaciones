import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchInstallerAgenda } from "@/lib/data/agenda";
import { defaultAgendaDateFrom } from "@/lib/domain/agenda";
import { InstallerAgendaTable } from "@/components/installer/agenda-table";

export default async function InstallerAgendaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [t, rows] = await Promise.all([
    getTranslations("InstallerAgenda"),
    fetchInstallerAgenda(supabase, user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <div className="mt-8">
        <InstallerAgendaTable rows={rows} defaultDateFrom={defaultAgendaDateFrom(new Date())} />
      </div>
    </div>
  );
}
