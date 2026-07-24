import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export async function FinancePeriodFilter({
  period,
  from,
  to,
}: {
  period: string;
  from: string;
  to: string;
}) {
  const t = await getTranslations("Finance");
  const presets = ["week", "fortnight", "month", "semester"] as const;
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((value) => (
          <Button key={value} asChild variant={period === value ? "default" : "outline"} size="sm">
            <Link href={`/finance?period=${value}`}>{t(`periods.${value}`)}</Link>
          </Button>
        ))}
      </div>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value="custom" />
        <label className="grid gap-1 text-xs text-muted-foreground">{t("from")}<Input type="date" name="from" defaultValue={from} required /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("to")}<Input type="date" name="to" defaultValue={to} required /></label>
        <Button type="submit" size="sm" variant={period === "custom" ? "default" : "outline"}>{t("applyPeriod")}</Button>
      </form>
    </section>
  );
}
