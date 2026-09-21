"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { clientInputSchema } from "@/lib/domain/clients";
import { invalidFieldMessage } from "@/lib/field-error-message";
import { createClient } from "@/lib/supabase/server";

/** El error de validación con los rótulos del formulario de cliente. */
async function clientFieldError(error: z.ZodError): Promise<string> {
  const f = await getTranslations("Clients");
  return invalidFieldMessage(error, {
    name: f("name"),
    taxId: f("taxId"),
    contactName: f("contact"),
    email: f("email"),
    phone: f("phone"),
    address: f("address"),
    notes: f("notes"),
    website: f("website"),
    instagram: f("instagram"),
    youtube: f("youtube"),
    tiktok: f("tiktok"),
  });
}

export type ClientActionState = { error: string | null; ok?: boolean };

export async function saveClient(
  clientId: string | null,
  _previous: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const t = await getTranslations("Errors");
  const parsed = clientInputSchema.safeParse({
    name: formData.get("name"),
    taxId: formData.get("taxId") ?? "",
    contactName: formData.get("contactName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
    website: formData.get("website") ?? "",
    instagram: formData.get("instagram") ?? "",
    youtube: formData.get("youtube") ?? "",
    tiktok: formData.get("tiktok") ?? "",
  });
  if (!parsed.success) return { error: await clientFieldError(parsed.error) };
  const user = await getAuthorizedUser();
  if (
    !user?.companyId ||
    // Sólo el gerente: la agenda de clientes es gestión de empresa.
    user.role !== "company_manager"
  ) {
    return { error: t("accessDenied") };
  }
  const supabase = await createClient();
  const values = {
    company_id: user.companyId,
    name: parsed.data.name,
    tax_id: parsed.data.taxId,
    contact_name: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    address: parsed.data.address,
    notes: parsed.data.notes,
    website: parsed.data.website,
    instagram: parsed.data.instagram,
    youtube: parsed.data.youtube,
    tiktok: parsed.data.tiktok,
    updated_at: new Date().toISOString(),
  };
  const result = clientId
    ? await supabase
        .from("clients")
        .update(values)
        .eq("id", clientId)
        .eq("company_id", user.companyId)
    : await supabase.from("clients").insert(values);
  if (result.error) return { error: result.error.message };
  revalidatePath("/clients");
  revalidatePath("/projects");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { error: null, ok: true };
}
