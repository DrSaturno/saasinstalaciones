import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { OrderDocument, type OrderPdfData } from "@/lib/pdf/order-document";
import type { OrderPriority, OrderStatus, OrderUpdateType } from "@/types/database";

/**
 * Orden de trabajo en PDF, para los tres tableros.
 *
 * No hay control de acceso propio: se usa el cliente de sesión, así que RLS
 * decide. Un instalador sólo alcanza sus órdenes, un coordinador las de sus
 * proyectos y el gerente las de su empresa; si la orden no le corresponde, la
 * consulta no devuelve nada y responde 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, priority, scheduled_date, created_at, amount, currency, indoor, requires_freight, freight_details, site_id, project_id, company_id, assigned_installer_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [t, statusT, createOrderT, format] = await Promise.all([
    getTranslations("OrderPdf"),
    getTranslations("Status"),
    getTranslations("CreateOrder"),
    getFormatter(),
  ]);

  const [
    { data: site },
    { data: project },
    { data: company },
    { data: installer },
    { data: updates },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select(
        "name, address, city, state, contact_name, contact_phone, opening_hours, access_notes, parking_notes, technical_notes, risk_notes",
      )
      .eq("id", order.site_id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("name, client_name")
      .eq("id", order.project_id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("name")
      .eq("id", order.company_id)
      .maybeSingle(),
    order.assigned_installer_id
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", order.assigned_installer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("order_updates")
      .select("type, note, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true })
      .limit(40),
  ]);

  const day = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "short" });

  const data: OrderPdfData = {
    orderNumber: order.order_number,
    title: order.title,
    status: order.status as OrderStatus,
    statusLabel: statusT(`order.${order.status as OrderStatus}`),
    priorityLabel: createOrderT(`priorities.${order.priority as OrderPriority}`),
    description: order.description ?? "",
    scheduledDate: order.scheduled_date
      ? format.dateTime(new Date(`${order.scheduled_date}T12:00:00Z`), {
          dateStyle: "long",
        })
      : null,
    createdAt: day(order.created_at),
    amount:
      order.amount !== null && order.currency
        ? format.number(Number(order.amount), {
            style: "currency",
            currency: order.currency,
          })
        : null,
    indoor: order.indoor,
    requiresFreight: order.requires_freight,
    freightDetails: order.freight_details ?? "",
    company: company?.name ?? "Se Instala",
    project: project?.name ?? "",
    client: project?.client_name ?? "",
    installer: installer?.full_name ?? "",
    site: {
      name: site?.name ?? "",
      address: site?.address ?? "",
      city: site?.city ?? "",
      state: site?.state ?? "",
      contactName: site?.contact_name ?? "",
      contactPhone: site?.contact_phone ?? "",
      openingHours: site?.opening_hours ?? "",
      accessNotes: site?.access_notes ?? "",
      parkingNotes: site?.parking_notes ?? "",
      technicalNotes: site?.technical_notes ?? "",
      riskNotes: site?.risk_notes ?? "",
    },
    history: (updates ?? []).map((update) => ({
      label: statusT(`update.${update.type as OrderUpdateType}`),
      note: update.note ?? "",
      date: day(update.created_at),
    })),
    labels: {
      documentKind: t("documentKind"),
      issued: t("issued"),
      assignment: t("assignment"),
      client: t("client"),
      project: t("project"),
      installer: t("installer"),
      scheduledDate: t("scheduledDate"),
      priority: t("priority"),
      amount: t("amount"),
      site: t("site"),
      siteName: t("siteName"),
      address: t("address"),
      contact: t("contact"),
      phone: t("phone"),
      openingHours: t("openingHours"),
      logistics: t("logistics"),
      indoor: t("indoor"),
      outdoor: t("outdoor"),
      withFreight: t("withFreight"),
      withoutFreight: t("withoutFreight"),
      instructions: t("instructions"),
      description: t("description"),
      access: t("access"),
      parking: t("parking"),
      technical: t("technical"),
      risks: t("risks"),
      freight: t("freight"),
      history: t("history"),
      installerSignature: t("installerSignature"),
      clientSignature: t("clientSignature"),
    },
  };

  const buffer = await renderToBuffer(<OrderDocument data={data} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${order.order_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
