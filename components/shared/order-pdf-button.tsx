import { FileDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/**
 * Descarga la orden en PDF. Es un link común, no un fetch: el navegador maneja
 * la descarga y el endpoint resuelve permisos por RLS con la sesión del pedido.
 */
export async function OrderPdfButton({
  orderId,
  size = "sm",
}: {
  orderId: string;
  size?: "sm" | "default";
}) {
  const t = await getTranslations("OrderPdf");

  return (
    <Button asChild variant="outline" size={size}>
      <a href={`/api/orders/${orderId}/pdf`} download>
        <FileDown className="size-4" aria-hidden="true" />
        {t("download")}
      </a>
    </Button>
  );
}
