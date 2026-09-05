"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { setOrderPaymentStatus } from "@/lib/actions/orders/payment";
import type { FinancialOverview } from "@/lib/domain/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Lo que la empresa le debe a sus instaladores: trabajo terminado y sin pagar.
 *
 * Es una lista de acción, no un informe — por eso ordena lo más viejo primero y
 * cada fila se puede saldar desde acá, sin entrar a la orden.
 */
export function FinancePendingPayments({
  rows,
  totals,
}: {
  rows: FinancialOverview["pendingPayments"];
  totals: FinancialOverview["pendingPaymentTotals"];
}) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const money = (value: number, currency: string) =>
    format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });

  const markPaid = (orderId: string, orderNumber: string) => {
    startTransition(async () => {
      const res = await setOrderPaymentStatus({ orderId, status: "paid" });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("markedPaid", { order: orderNumber }));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HandCoins className="size-4 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{t("pendingPaymentsTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("pendingPaymentsDescription")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {totals.map((total) => (
              <div key={total.currency} className="text-right">
                <p className="font-mono text-lg font-semibold">{money(total.total, total.currency)}</p>
                <p className="text-caption text-muted-foreground">
                  {t("ordersCount", { count: total.orders })} · {total.currency}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("pendingPaymentsEmpty")}</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("order")}</th>
                <th className="px-4 py-3 font-medium">{t("installer")}</th>
                <th className="px-4 py-3 font-medium">{t("finishedOn")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("installerCost")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.orderId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link className="font-mono text-xs font-medium hover:text-primary" href={`/orders/${row.orderId}`}>
                      {row.orderNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{row.projectName}</p>
                  </td>
                  <td className="px-4 py-3">{row.installerName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.finalizedAt ? format.dateTime(new Date(row.finalizedAt), { dateStyle: "short" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {money(row.installerCost, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => markPaid(row.orderId, row.orderNumber)}
                    >
                      {t("markPaid")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
