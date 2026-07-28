"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; ok?: boolean };

const input = z.object({
  siteId: z.string().uuid(),
  storagePath: z.string().trim().min(1).max(500),
  attachmentId: z.string().uuid().nullable(),
});

/**
 * Borra una imagen del historial de la locación.
 *
 * Dos orígenes, dos tratamientos:
 *  - `order_attachments`: se borra la fila y el archivo.
 *  - foto de un avance (`order_updates.photos`): NO se borra el avance, que es
 *    el registro de lo que pasó en obra; se le quita la foto del arreglo y se
 *    borra el archivo. El texto del avance y su fecha quedan intactos.
 *
 * Sólo el gerente. RLS vuelve a validar.
 */
export async function deleteSiteGalleryItem(payload: {
  siteId: string;
  storagePath: string;
  attachmentId: string | null;
}): Promise<Result> {
  const t = await getTranslations("Errors");
  const parsed = input.safeParse(payload);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (
      !user ||
      user.role !== "company_manager" ||
      !user.companyId
    ) {
      return { error: t("accessDenied") };
    }
    const supabase = await createClient();

    const { data: site } = await supabase
      .from("sites")
      .select("id, project_id")
      .eq("id", parsed.data.siteId)
      .single();
    if (!site) return { error: t("operation") };

    if (parsed.data.attachmentId) {
      const { error } = await supabase
        .from("order_attachments")
        .delete()
        .eq("id", parsed.data.attachmentId);
      if (error) return { error: t("operation") };
    } else {
      // Sacar la ruta del arreglo de fotos del avance que la contiene.
      const { data: orders } = await supabase
        .from("work_orders")
        .select("id")
        .eq("site_id", site.id);
      const orderIds = (orders ?? []).map((order) => order.id);
      if (orderIds.length === 0) return { error: t("operation") };

      const { data: updates } = await supabase
        .from("order_updates")
        .select("id, photos")
        .in("order_id", orderIds);

      const target = (updates ?? []).find(
        (update) =>
          Array.isArray(update.photos) &&
          update.photos.includes(parsed.data.storagePath),
      );
      if (!target) return { error: t("operation") };

      const remaining = (target.photos as string[]).filter(
        (photo) => photo !== parsed.data.storagePath,
      );
      const { error } = await supabase
        .from("order_updates")
        .update({ photos: remaining })
        .eq("id", target.id);
      if (error) return { error: t("operation") };
    }

    await supabase.storage.from("evidence").remove([parsed.data.storagePath]);

    revalidatePath(`/projects/${site.project_id}/sites/${site.id}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
