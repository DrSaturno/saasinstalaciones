import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { GOOGLE_OAUTH_STATE_COOKIE, applicationOrigin, encryptGoogleToken, googleOAuthClient } from "@/lib/google-calendar/config";
import { ensureCompanyCalendar } from "@/lib/google-calendar/calendar";
import { createClient } from "@/lib/supabase/server";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";

export async function GET(request: NextRequest) {
  const target = (result: string) => NextResponse.redirect(`${applicationOrigin()}/dashboard?calendar=${result}`);
  const user = await getAuthorizedUser();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!user || user.role !== "company_manager" || !user.companyId || !code || !state || state !== request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value) return target("error");
  try {
    const oauth = googleOAuthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token) return target("error");
    const supabase = await createClient();
    // La conexión es de la empresa, no de la persona (DEC-GCAL-06): si otro
    // gerente ya conectó, esto reemplaza esa conexión en vez de crear una
    // segunda con un calendario duplicado.
    const { data: current } = await supabase.from("calendar_connections").select("encrypted_refresh_token, calendar_id").eq("company_id", user.companyId).maybeSingle();
    if (!tokens.refresh_token && !current) return target("error");
    const [profileResponse, { data: company }] = await Promise.all([
      fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) }),
      supabase.from("companies").select("name").eq("id", user.companyId).single(),
    ]);
    const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
    // El calendario propio se arma acá y no en el primer sync: si falla, la
    // conexión no se guarda y la persona lo ve al instante, en vez de creer
    // que conectó bien y descubrirlo cuando sincroniza.
    oauth.setCredentials(tokens);
    const calendarId = await ensureCompanyCalendar(oauth, company?.name ?? "Se Instala", current?.calendar_id ?? null);
    await supabase.from("calendar_connections").upsert({ company_id: user.companyId, user_id: user.id, google_email: profile.email ?? user.email ?? "", calendar_id: calendarId, encrypted_access_token: encryptGoogleToken(tokens.access_token), encrypted_refresh_token: tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : current!.encrypted_refresh_token, token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    const response = target("connected"); response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE); return response;
  } catch { return target("error"); }
}
