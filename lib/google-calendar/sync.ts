import "server-only";

import type { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applicationOrigin, decryptGoogleToken, encryptGoogleToken, googleOAuthClient } from "@/lib/google-calendar/config";
import { exclusiveEndDate } from "@/lib/google-calendar/event-link";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";
import type { Database, OrderStatus } from "@/types/database";

type Connection = Database["public"]["Tables"]["calendar_connections"]["Row"];
type CalendarOrder = { id: string; order_number: string; title: string; description: string; status: OrderStatus; scheduled_date: string | null; scheduled_end_date: string | null; project_id: string; site_id: string };


async function authorizedClient(supabase: SupabaseClient<Database>, connection: Connection) {
  const client = googleOAuthClient();
  client.setCredentials({ access_token: decryptGoogleToken(connection.encrypted_access_token), refresh_token: decryptGoogleToken(connection.encrypted_refresh_token), expiry_date: connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : undefined });
  await client.getAccessToken();
  const credentials = client.credentials;
  if (credentials.access_token) await supabase.from("calendar_connections").update({ encrypted_access_token: encryptGoogleToken(credentials.access_token), encrypted_refresh_token: encryptGoogleToken(credentials.refresh_token ?? decryptGoogleToken(connection.encrypted_refresh_token)), token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  return client;
}

function eventBody(order: CalendarOrder, projectName: string, site: { name: string; address: string; city: string; state: string }) {
  const end = order.scheduled_end_date ?? order.scheduled_date!;
  return {
    summary: `[${order.order_number}] ${order.title}`,
    description: [projectName, order.description, `${applicationOrigin()}/orders/${order.id}`].filter(Boolean).join("\n\n"),
    location: [site.name, site.address, site.city, site.state].filter(Boolean).join(", "),
    start: { date: order.scheduled_date },
    end: { date: exclusiveEndDate(end) },
    extendedProperties: { private: { instalaProOrderId: order.id } },
  };
}

async function upsertEvent(client: OAuth2Client, calendarId: string, eventId: string | null, body: ReturnType<typeof eventBody>) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  if (eventId) {
    try { const response = await client.request<{ id: string }>({ url: `${base}/${encodeURIComponent(eventId)}`, method: "PUT", data: body, timeout: EXTERNAL_TIMEOUT_MS }); return response.data.id; }
    catch (error) { const status = (error as { response?: { status?: number } }).response?.status; if (status !== 404 && status !== 410) throw error; }
  }
  const response = await client.request<{ id: string }>({ url: base, method: "POST", data: body, timeout: EXTERNAL_TIMEOUT_MS });
  return response.data.id;
}

/**
 * Manda UNA orden al calendario de la empresa.
 *
 * Existe porque sincronizar todo para reflejar un cambio puntual es caro y
 * lento: con cientos de órdenes, mover una fecha significaba reescribir el
 * calendario entero. Comparte el `upsertEvent` con la sincronización completa,
 * así que el evento que produce es idéntico.
 */
export async function syncOrderToCalendar(
  supabase: SupabaseClient<Database>,
  companyId: string,
  orderId: string,
): Promise<{ synced: boolean; reason?: "not_connected" | "not_found" | "no_date" }> {
  const { data: connection } = await supabase.from("calendar_connections").select("*").eq("company_id", companyId).maybeSingle();
  if (!connection) return { synced: false, reason: "not_connected" };

  const { data: order } = await supabase
    .from("work_orders")
    .select("id, order_number, title, description, status, scheduled_date, scheduled_end_date, project_id, site_id")
    .eq("id", orderId)
    .maybeSingle<CalendarOrder>();
  if (!order) return { synced: false, reason: "not_found" };
  if (!order.scheduled_date) return { synced: false, reason: "no_date" };

  const [{ data: site }, { data: project }, { data: mapping }] = await Promise.all([
    supabase.from("sites").select("id, name, address, city, state").eq("id", order.site_id).maybeSingle(),
    supabase.from("projects").select("name").eq("id", order.project_id).maybeSingle(),
    supabase.from("calendar_order_events").select("id, google_event_id").eq("connection_id", connection.id).eq("order_id", order.id).maybeSingle(),
  ]);
  if (!site) return { synced: false, reason: "not_found" };

  const client = await authorizedClient(supabase, connection);
  const googleEventId = await upsertEvent(client, connection.calendar_id, mapping?.google_event_id ?? null, eventBody(order, project?.name ?? "Se Instala", site));
  await supabase.from("calendar_order_events").upsert({ company_id: connection.company_id, connection_id: connection.id, order_id: order.id, google_event_id: googleEventId, last_synced_at: new Date().toISOString() }, { onConflict: "connection_id,order_id" });
  return { synced: true };
}

export async function syncCompanyCalendar(supabase: SupabaseClient<Database>, companyId: string) {
  // Por empresa, no por usuario: la conexión la puede haber armado otro
  // gerente y el calendario es el mismo para todos (DEC-GCAL-06).
  const { data: connection } = await supabase.from("calendar_connections").select("*").eq("company_id", companyId).maybeSingle();
  if (!connection) return { synced: 0, removed: 0 };
  const client = await authorizedClient(supabase, connection);
  const [{ data: orders }, { data: mappings }] = await Promise.all([
    supabase.from("work_orders").select("id, order_number, title, description, status, scheduled_date, scheduled_end_date, project_id, site_id").not("scheduled_date", "is", null).overrideTypes<CalendarOrder[]>(),
    supabase.from("calendar_order_events").select("id, order_id, google_event_id").eq("connection_id", connection.id),
  ]);
  const orderRows = orders ?? [];
  const projectIds = [...new Set(orderRows.map((order) => order.project_id))];
  const siteIds = [...new Set(orderRows.map((order) => order.site_id))];
  const [{ data: projects }, { data: sites }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    siteIds.length ? supabase.from("sites").select("id, name, address, city, state").in("id", siteIds) : Promise.resolve({ data: [] as { id: string; name: string; address: string; city: string; state: string }[] }),
  ]);
  const projectMap = new Map((projects ?? []).map((item) => [item.id, item.name]));
  const siteMap = new Map((sites ?? []).map((item) => [item.id, item]));
  const mappingMap = new Map((mappings ?? []).map((item) => [item.order_id, item]));
  let synced = 0; let removed = 0;

  for (const order of orderRows) {
    const mapping = mappingMap.get(order.id);
    if (order.status === "cancelada") {
      if (mapping) { try { await client.request({ url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(mapping.google_event_id)}`, method: "DELETE", timeout: EXTERNAL_TIMEOUT_MS }); } catch { /* A deleted remote event is already consistent. */ } await supabase.from("calendar_order_events").delete().eq("id", mapping.id); removed++; }
      continue;
    }
    const site = siteMap.get(order.site_id); if (!site) continue;
    const googleEventId = await upsertEvent(client, connection.calendar_id, mapping?.google_event_id ?? null, eventBody(order, projectMap.get(order.project_id) ?? "Se Instala", site));
    await supabase.from("calendar_order_events").upsert({ company_id: connection.company_id, connection_id: connection.id, order_id: order.id, google_event_id: googleEventId, last_synced_at: new Date().toISOString() }, { onConflict: "connection_id,order_id" });
    synced++;
  }
  return { synced, removed };
}
