import { MapPinned, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FinanceBreakdown } from "@/lib/domain/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinanceBreakdowns({ zones, installers }: { zones: FinanceBreakdown[]; installers: FinanceBreakdown[] }) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const groups = [{ key: "zones", title: t("zonesTitle"), icon: MapPinned, rows: zones }, { key: "installers", title: t("installersTitle"), icon: UsersRound, rows: installers }];
  const money = (value: number, currency: string) => format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(({ key, title, icon: Icon, rows }) => (
        <Card key={key}>
          <CardHeader className="border-b"><div className="flex items-center gap-2"><Icon className="size-4 text-primary" aria-hidden="true" /><CardTitle>{title}</CardTitle></div></CardHeader>
          <CardContent className="px-0">
            {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyBreakdown")}</p> : rows.slice(0, 12).map((row) => (
              <div key={`${row.currency}-${row.name}`} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="font-mono text-[11px] text-muted-foreground">{t("ordersCount", { count: row.orders })} · {row.currency}</p></div>
                <div className="text-right"><p className="font-mono text-sm font-semibold">{money(row.completed, row.currency)}</p><p className="text-[11px] text-muted-foreground">{t("ofContracted", { value: money(row.contracted, row.currency) })}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
