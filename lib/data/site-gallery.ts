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
  /** Proyecto de donde salió. Vacío si es del proyecto que se está mirando. */
  fromProject: string;
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
 * El historial sigue a la locación FÍSICA, no a la fila: si el mismo local se
 * reutilizó en varios proyectos del cliente, se juntan las imágenes de todos.
 * Cada fila de `sites` es una copia por proyecto, así que se emparejan por
 * código interno o, si no lo tienen, por nombre y dirección.
 *
 * RLS acota todo a la empresa; no hace falta filtrar por compañía a mano.
 */
export async function fetchSiteGallery(
  supabase: SupabaseClient<Database>,
  siteId: string,
): Promise<SiteGalleryItem[]> {
  const t = await getTranslations("SiteGallery");

  const { data: site } = await supabase
    .from("sites")
    .select("id, project_id, location_id, name, address, external_ref")
    .eq("id", siteId)
    .single();
  if (!site) return [];

  const siteIds = await gatherTwinSites(supabase, site);

  const { data: orders } = await supabase
    .from("work_orders")
    .select("id, order_number, site_id, project_id")
    .in("site_id", siteIds);
  if (!orders?.length) return [];

  // Nombre del proyecto de origen, sólo para las imágenes que vienen de otro.
  const foreignProjectIds = [
    ...new Set(
      orders
        .filter((order) => order.site_id !== siteId)
        .map((order) => order.project_id),
    ),
  ];
  const { data: projects } = foreignProjectIds.length
    ? await supabase.from("projects").select("id, name").in("id", foreignProjectIds)
    : { data: [] };
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const orderIds = orders.map((order) => order.id);
  const numberById = new Map(orders.map((order) => [order.id, order.order_number]));
  const originById = new Map(
    orders.map((order) => [
      order.id,
      order.site_id === siteId ? "" : (projectName.get(order.project_id) ?? ""),
    ]),
  );

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
      fromProject: originById.get(attachment.order_id) ?? "",
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
        fromProject: originById.get(update.order_id) ?? "",
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

/**
 * Las filas de `sites` que representan el MISMO local físico.
 *
 * Al reutilizar una locación en un proyecto nuevo se crea una fila nueva, así
 * que el historial quedaría partido. Se emparejan las del mismo cliente por
 * código interno y, si no lo tienen, por nombre + dirección.
 */
async function gatherTwinSites(
  supabase: SupabaseClient<Database>,
  site: {
    id: string;
    project_id: string;
    location_id: string | null;
    name: string;
    address: string;
    external_ref: string | null;
  },
): Promise<string[]> {
  if (site.location_id) {
    const { data: projections } = await supabase
      .from("sites")
      .select("id")
      .eq("location_id", site.location_id);
    const ids = (projections ?? []).map((projection) => projection.id);
    return ids.length ? ids : [site.id];
  }

  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", site.project_id)
    .single();
  if (!project?.client_id) return [site.id];

  const { data: siblings } = await supabase
    .from("projects")
    .select("id")
    .eq("client_id", project.client_id);
  const projectIds = (siblings ?? []).map((sibling) => sibling.id);
  if (projectIds.length <= 1) return [site.id];

  const { data: candidates } = await supabase
    .from("sites")
    .select("id, name, address, external_ref")
    .in("project_id", projectIds);

  const ref = site.external_ref?.trim().toLowerCase();
  const pair = `${site.name.trim().toLowerCase()}|${site.address.trim().toLowerCase()}`;

  const twins = (candidates ?? [])
    .filter((candidate) => {
      if (candidate.id === site.id) return true;
      const candidateRef = candidate.external_ref?.trim().toLowerCase();
      if (ref && candidateRef) return candidateRef === ref;
      return (
        `${candidate.name.trim().toLowerCase()}|${candidate.address.trim().toLowerCase()}` ===
        pair
      );
    })
    .map((candidate) => candidate.id);

  return twins.length ? twins : [site.id];
}
