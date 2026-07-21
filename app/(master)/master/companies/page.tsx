import { CompaniesTable } from "@/components/master/companies-table";
import { useTranslations } from "next-intl";

export default function MasterCompaniesPage() {
  const t = useTranslations("Master");
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t("companiesTitle")}</h1>
      <p className="mt-1 text-muted-foreground">
        {t("companiesDescription")}
      </p>
      <div className="mt-8">
        <CompaniesTable />
      </div>
    </div>
  );
}
