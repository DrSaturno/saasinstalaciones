import Link from "next/link";
import { useTranslations } from "next-intl";
import { OverviewMetrics } from "@/components/master/overview-metrics";
import { Button } from "@/components/ui/button";

export default function MasterHome() {
  const t = useTranslations("Master");
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button asChild>
          <Link href="/master/companies">{t("manageCompanies")}</Link>
        </Button>
      </div>

      <div className="mt-8">
        <OverviewMetrics />
      </div>
    </div>
  );
}
