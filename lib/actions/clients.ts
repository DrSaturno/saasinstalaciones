"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2).max(150),
  taxId: z.string().trim().max(40),
  contactName: z.string().trim().max(120),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(250),
  notes: z.string().trim().max(2000),
});

export type ClientActionState = { error: string | null; ok?: boolean };

export async function saveClient(
  clientId: string | null,
  _previous: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    taxId: formData.get("taxId") ?? "",
    contactName: formData.get("contactName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: t("invalidData") };
  const user = await getCurrentUser();
  if (
    !user?.companyId ||
    !["company_manager", "coordinator"].includes(user.role)
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
