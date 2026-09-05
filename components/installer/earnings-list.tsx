import Link from "next/link";
import { Building2, WalletCards } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { InstallerEarningsOverview } from "@/lib/domain/installer-finance";
import { Badge } from "@/components/ui/badge";

/**
 * Trabajo por trabajo, con lo que le corresponde al instalador.
 *
 * Tarjetas y no tabla: esta pantalla se diseña primero para 375px, y una tabla
 * de seis columnas en un celular obliga a scrollear de costado para leer una
 * sola fila.
 */
export async function EarningsList({
  rows,
}: {
  rows: InstallerEarningsOverview["rows"];
}) {
  const [t, statusT, format] = await Promise.all([
    getTranslations("InstallerFinance"),
    getTranslations("Status"),
    getFormatter(),
  ]);
  const money = (value: number, currency: string) =>
    format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });

  if (rows.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center">
        <WalletCards className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted-foreground">{t("emptyList")}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.orderId}>
          <Link
            href={`/tasks/${row.orderId}`}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{row.orderNumber}</p>
                <p className="mt-0.5 truncate font-medium">{row.title}</p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Building2 className="size-3 shrink-0" aria-hidden="true" />
                  {row.companyName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-semibold">{money(row.amount, row.currency)}</p>
                <p className="font-mono text-caption text-muted-foreground">{row.currency}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`status-${row.status}`}>
                {statusT(`order.${row.status}`)}
              </Badge>
              {/* El estado de cobro sólo tiene sentido en trabajo terminado:
                  antes de eso todavía no hay nada que cobrar. */}
              {row.status === "finalizada" ? (
                <Badge
                  variant="secondary"
                  className={row.paymentStatus === "paid" ? "bg-success/15 text-success" : "bg-cream text-foreground"}
                >
                  {row.paymentStatus === "paid" ? t("statusPaid") : t("statusPending")}
                </Badge>
              ) : null}
              {row.date ? (
                <span className="ml-auto font-mono text-caption text-muted-foreground">
                  {format.dateTime(new Date(row.date), { dateStyle: "short" })}
                </span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
