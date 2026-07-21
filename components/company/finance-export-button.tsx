"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FinancialOverview } from "@/lib/domain/finance";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function FinanceExportButton({ rows }: { rows: FinancialOverview["projects"] }) {
  const t = useTranslations("Finance");
  const download = () => {
    const header = [t("csv.project"), t("csv.mode"), t("csv.currency"), t("csv.contracted"), t("csv.completed"), t("csv.pending"), t("csv.progress")];
    const body = rows.map((row) => [row.name, t(`mode.${row.mode}`), row.currency, row.contracted, row.completed, row.pending, `${row.progress}%`]);
    const csv = `\uFEFF${[header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `instala-pro-finanzas-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  return <Button type="button" variant="outline" onClick={download}><Download className="size-4" aria-hidden="true" />{t("export")}</Button>;
}
