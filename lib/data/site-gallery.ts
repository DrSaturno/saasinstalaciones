import "server-only";

import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SiteGalleryOrigin = "order_attachment" | "order_update";

export type SiteGalleryItem = {
  key: string;
  origin: SiteGalleryOrigin;
  /** Id de la fila en `order_attachments`; null cuando viene de un avance. */
  attachmentId: string | null;
  storagePath: string;
  signedUrl: string | null;
  fileName: string;
  isImage: boolean;
  orderId: string;
  orderNumber: string;
  createdAt: string;
  note: string;
};

/**
 * Todas las imágenes y archivos que pasaron por una locación.
 *
 * Junta dos orígenes que hasta ahora vivían separados y sólo se veían dentro de
 * cada orden: los adjuntos cargados al crear o editar la orden
 * (`order_attachments`) y las fotos de los avances del instalador
 * (`order_updates.photos`). La locación es lo permanente — las órdenes van y
 * vienen —, así que su historial visual tiene que quedar acá.
 *
 * RLS acota todo a la empresa; no hace falta filtrar por compañía a mano.
 */
export async function fetchSiteGallery(
  supabase: SupabaseClient<Database>,
  siteId: string,
): Promise<SiteGalleryItem[]> {
  const t = await getTranslations("SiteGallery");

  const { data: orders } = await supabase
    .from("work_orders")
    .select("id, order_number")
    .eq("site_id", siteId);
  if (!orders?.length) return [];

  const orderIds = orders.map((order) => order.id);
  const numberById = new Map(orders.map((order) => [order.id, order.order_number]));

  const [{ data: attachments }, { data: updates }] = await Promise.all([
    supabase
      .from("order_attachments")
      .select("id, order_id, storage_path, file_name, mime_type, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("order_updates")
      .select("id, order_id, type, note, photos, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
  ]);

  const items: Omit<SiteGalleryItem, "signedUrl">[] = [];

  for (const attachment of attachments ?? []) {
    items.push({
      key: `att-${attachment.id}`,
      origin: "order_attachment",
      attachmentId: attachment.id,
      storagePath: attachment.storage_path,
      fileName: attachment.file_name,
      isImage: attachment.mime_type.startsWith("image/"),
      orderId: attachment.order_id,
      orderNumber: numberById.get(attachment.order_id) ?? "",
      createdAt: attachment.created_at,
      note: t("fromOrder"),
    });
  }

  for (const update of updates ?? []) {
    const photos = Array.isArray(update.photos) ? update.photos : [];
    photos.forEach((photo, index) => {
      if (typeof photo !== "string") return;
      items.push({
        key: `upd-${update.id}-${index}`,
        origin: "order_update",
        attachmentId: null,
        storagePath: photo,
        fileName: photo.split("/").pop() ?? photo,
        isImage: true,
        orderId: update.order_id,
        orderNumber: numberById.get(update.order_id) ?? "",
        createdAt: update.created_at,
        note: update.note || t("fromUpdate"),
      });
    });
  }

  if (items.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from("evidence")
    .createSignedUrls(
      [...new Set(items.map((item) => item.storagePath))],
      60 * 30,
    );
  const urlByPath = new Map(
    (signed ?? []).map((item) => [item.path, item.signedUrl ?? null]),
  );

  return items
    .map((item) => ({
      ...item,
      signedUrl: urlByPath.get(item.storagePath) ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
