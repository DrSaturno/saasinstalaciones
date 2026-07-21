import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GOOGLE_OAUTH_STATE_COOKIE, applicationOrigin, encryptGoogleToken, googleOAuthClient } from "@/lib/google-calendar/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const target = (result: string) => NextResponse.redirect(`${applicationOrigin()}/dashboard?calendar=${result}`);
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!user || user.role !== "company_manager" || !user.companyId || !code || !state || state !== request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value) return target("error");
  try {
    const oauth = googleOAuthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token) return target("error");
    const supabase = await createClient();
    const { data: current } = await supabase.from("calendar_connections").select("encrypted_refresh_token").eq("user_id", user.id).maybeSingle();
    if (!tokens.refresh_token && !current) return target("error");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
    await supabase.from("calendar_connections").upsert({ company_id: user.companyId, user_id: user.id, google_email: profile.email ?? user.email ?? "", calendar_id: "primary", encrypted_access_token: encryptGoogleToken(tokens.access_token), encrypted_refresh_token: tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : current!.encrypted_refresh_token, token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    const response = target("connected"); response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE); return response;
  } catch { return target("error"); }
}
