import { MapPinned } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CreateOrdersDialog } from "@/components/company/create-orders-dialog";
import { CreateSiteDialog } from "@/components/company/create-site-dialog";
import { ImportSitesDialog } from "@/components/company/import-sites-dialog";
import { OrderFormSection } from "@/components/company/order-form-section";
import { ReuseSitesDialog } from "@/components/company/reuse-sites-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Country, OrderCurrency } from "@/types/database";

/**
 * Cargar locaciones y generar sus órdenes, en dos pasos numerados.
 *
 * Antes eran seis botones en fila dentro del diálogo «Administrar
 * instalaciones». Ahí el trabajo en lote —cargar 30 locaciones de una planilla
 * y generarles 30 órdenes con los mismos datos— era invisible: había que abrir
 * un diálogo para descubrirlo, y el número de órdenes que se iban a crear
 * recién aparecía en el pie del formulario, con la decisión ya tomada.
 */
export async function ProjectSitesActions({
  projectId,
  country,
  zones,
  activeCount,
  pendingOrders,
  roster,
  currency,
  canManageFinance,
  perInstallation,
}: {
  projectId: string;
  country: Country;
  zones: string[];
  activeCount: number;
  /** Locaciones activas que todavía no tienen orden: lo que crearía el paso 2. */
  pendingOrders: number;
  roster: { id: string; name: string }[];
  currency: OrderCurrency;
  canManageFinance: boolean;
  perInstallation: boolean;
}) {
  const t = await getTranslations("SitesActions");

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <MapPinned className="size-4 text-primary" aria-hidden="true" />
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 xl:grid-cols-2">
        <OrderFormSection number="01" title={t("loadTitle")} description={t("loadDescription")}>
          <div className="flex flex-wrap gap-2">
            <CreateSiteDialog projectId={projectId} country={country} zones={zones} />
            <ReuseSitesDialog projectId={projectId} />
          </div>

          {/* La planilla es el camino del lote, y el orden de los botones es el
              orden real del circuito: bajar → completar → subir. Exportar cierra
              el ida y vuelta, y se oculta sin locaciones porque daría un archivo
              vacío. */}
          <div className="rounded-xl border bg-muted/25 p-3">
            <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
              {t("bulkTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("bulkDescription")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <a href="/api/site-template" download>{t("template")}</a>
              </Button>
              <ImportSitesDialog projectId={projectId} />
              {activeCount > 0 ? (
                <Button type="button" variant="outline" asChild>
                  <a href={`/api/projects/${projectId}/sites/export`} download>{t("export")}</a>
                </Button>
              ) : null}
            </div>
          </div>
        </OrderFormSection>

        <OrderFormSection number="02" title={t("ordersTitle")} description={t("ordersDescription")}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              {/* El número antes del click: cuántas órdenes va a crear. */}
              <p className="font-mono text-3xl font-semibold leading-none">{pendingOrders}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {activeCount === 0
                  ? t("noSites")
                  : pendingOrders === 0
                    ? t("allCovered")
                    : t("pendingOrders")}
              </p>
            </div>
            <CreateOrdersDialog
              projectId={projectId}
              siteCount={activeCount}
              roster={roster}
              currency={currency}
              canManageFinance={canManageFinance}
              perInstallation={perInstallation}
            />
          </div>
        </OrderFormSection>
      </CardContent>
    </Card>
  );
}
