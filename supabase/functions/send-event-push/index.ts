import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVENTS = [
  "broadcast_created",
  "application_received",
  "application_accepted",
  "application_rejected",
  "order_assigned",
  "update_received",
] as const;
type EventName = (typeof EVENTS)[number];

type Input = { event: EventName; resourceId: string; subjectId?: string };
type Profile = { id: string; role: string; company_id: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!url || !anonKey || !serviceKey) return response({ error: "Supabase no configurado" }, 503);
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return response({ error: "Web Push no configurado" }, 503);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "No autenticado" }, 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authorization.slice("Bearer ".length);
  const { data: { user }, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !user) return response({ error: "Sesión inválida" }, 401);

  let rawInput: unknown;
  try {
    rawInput = await request.json();
  } catch {
    return response({ error: "JSON inválido" }, 400);
  }
  if (!rawInput || Array.isArray(rawInput) || typeof rawInput !== "object") {
    return response({ error: "Evento inválido" }, 400);
  }
  const candidate = rawInput as Record<string, unknown>;
  if (
    typeof candidate.event !== "string" ||
    !EVENTS.includes(candidate.event as EventName) ||
    typeof candidate.resourceId !== "string" ||
    !UUID.test(candidate.resourceId) ||
    (candidate.subjectId !== undefined &&
      (typeof candidate.subjectId !== "string" || !UUID.test(candidate.subjectId)))
  ) {
    return response({ error: "Evento inválido" }, 400);
  }
  const input: Input = {
    event: candidate.event as EventName,
    resourceId: candidate.resourceId,
    subjectId: candidate.subjectId as string | undefined,
  };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return response({ error: "Acceso denegado" }, 403);

  const isAuthorized = async (caller: Profile, eventInput: Input) => {
    if (
      eventInput.event === "broadcast_created" ||
      eventInput.event === "application_accepted" ||
      eventInput.event === "application_rejected"
    ) {
      if (caller.role !== "company_manager" || !caller.company_id) return false;
      const { data } = await admin.from("broadcasts").select("id").eq("id", eventInput.resourceId).eq("company_id", caller.company_id).maybeSingle();
      return Boolean(data);
    }
    if (eventInput.event === "application_received") {
      if (caller.role !== "installer" || (eventInput.subjectId && eventInput.subjectId !== caller.id)) return false;
      const { data } = await admin.from("broadcast_applications").select("broadcast_id").eq("broadcast_id", eventInput.resourceId).eq("installer_id", caller.id).maybeSingle();
      return Boolean(data);
    }
    if (eventInput.event === "order_assigned") {
      if (caller.role !== "company_manager" || !caller.company_id) return false;
      const { data } = await admin.from("work_orders").select("id, assigned_installer_id").eq("id", eventInput.resourceId).eq("company_id", caller.company_id).maybeSingle();
      return Boolean(data && (!eventInput.subjectId || data.assigned_installer_id === eventInput.subjectId));
    }
    if (eventInput.event === "update_received") {
      if (caller.role !== "installer") return false;
      const { data } = await admin.from("order_updates").select("id").eq("id", eventInput.resourceId).eq("installer_id", caller.id).maybeSingle();
      return Boolean(data);
    }
    return false;
  };

  if (!(await isAuthorized(profile, input))) {
    return response({ error: "Acceso denegado" }, 403);
  }

  const filter = notificationFilter(input);
  let query = admin
    .from("notifications")
    .select("id, user_id, title, body, data")
    .eq("type", filter.type)
    .is("push_sent_at", null)
    .contains("data", filter.data)
    .limit(250);
  if (input.subjectId) query = query.eq("user_id", input.subjectId);
  const { data: notifications, error: notificationError } = await query;
  if (notificationError) return response({ error: notificationError.message }, 500);
  if (!notifications?.length) return response({ delivered: 0 });

  const userIds = [...new Set(notifications.map((item) => item.user_id))];
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, keys")
    .in("user_id", userIds);

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  let delivered = 0;
  for (const notification of notifications) {
    const targets = (subscriptions ?? []).filter((item) => item.user_id === notification.user_id);
    for (const target of targets) {
      const keys = target.keys as { p256dh?: string; auth?: string };
      if (!keys.p256dh || !keys.auth) continue;
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            url: safeUrl(notification.data),
            tag: notification.id,
          }),
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("user_id", target.user_id).eq("endpoint", target.endpoint);
        }
      }
    }
  }

  await admin
    .from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .in("id", notifications.map((item) => item.id));
  return response({ delivered });
});

function notificationFilter(input: Input): { type: string; data: Record<string, string> } {
  if (input.event === "broadcast_created") return { type: "broadcast_new", data: { broadcast_id: input.resourceId } };
  if (input.event === "application_received") return { type: "application_received", data: { broadcast_id: input.resourceId } };
  if (input.event === "application_accepted") return { type: "application_accepted", data: { broadcast_id: input.resourceId } };
  if (input.event === "application_rejected") return { type: "application_rejected", data: { broadcast_id: input.resourceId } };
  if (input.event === "order_assigned") return { type: "order_assigned", data: { order_id: input.resourceId } };
  return { type: "update_received", data: { update_id: input.resourceId } };
}

function safeUrl(data: unknown): string {
  if (!data || Array.isArray(data) || typeof data !== "object") return "/";
  const value = (data as Record<string, unknown>).url;
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
