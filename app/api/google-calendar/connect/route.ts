import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GOOGLE_OAUTH_STATE_COOKIE, applicationOrigin, googleCalendarConfigured, googleOAuthClient } from "@/lib/google-calendar/config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !googleCalendarConfigured()) return NextResponse.redirect(new URL("/dashboard?calendar=unavailable", applicationOrigin()));
  const state = randomBytes(32).toString("base64url");
  const url = googleOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true, state, scope: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"] });
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google-calendar/callback", maxAge: 600 });
  return response;
}
