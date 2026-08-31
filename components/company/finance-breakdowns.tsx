import { MapPinned, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FinanceBreakdown } from "@/lib/domain/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinanceBreakdowns({ zones, installers }: { zones: FinanceBreakdown[]; installers: FinanceBreakdown[] }) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  // El desglose por instalador muestra el COSTO (lo que se le paga); el de zona
  // muestra el ingreso. Hasta ahora los dos mostraban el ingreso, y el de
  // instalador parecía decir cuánto cobraba esa persona: era el mismo número.
  const groups = [
    { key: "zones", title: t("zonesTitle"), icon: MapPinned, rows: zones, showCost: false },
    { key: "installers", title: t("installersTitle"), icon: UsersRound, rows: installers, showCost: true },
  ];
  const money = (value: number, currency: string) => format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(({ key, title, icon: Icon, rows, showCost }) => (
        <Card key={key}>
          <CardHeader className="border-b"><div className="flex items-center gap-2"><Icon className="size-4 text-primary" aria-hidden="true" /><CardTitle>{title}</CardTitle></div></CardHeader>
          <CardContent className="px-0">
            {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyBreakdown")}</p> : rows.slice(0, 12).map((row) => (
              <div key={`${row.currency}-${row.name}`} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="font-mono text-[11px] text-muted-foreground">{t("ordersCount", { count: row.orders })} · {row.currency}</p></div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold">{money(showCost ? row.installerCost : row.completed, row.currency)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {showCost
                      ? t("generatedRevenue", { value: money(row.completed, row.currency) })
                      : t("ofContracted", { value: money(row.contracted, row.currency) })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
