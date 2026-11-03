import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) {
    return new NextResponse(null, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("finance_invoices").select("storage_path")
    .eq("id", id).eq("company_id", user.companyId).maybeSingle();
  if (!invoice?.storage_path) return new NextResponse(null, { status: 404 });
  const { data } = await supabase.storage.from("finance-private")
    .createSignedUrl(invoice.storage_path, 60);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302,
    headers: { "Cache-Control": "private, no-store" } });
}
