import "server-only";

import { OAuth2Client } from "google-auth-library";
export { decryptGoogleToken, encryptGoogleToken } from "@/lib/google-calendar/crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "instalapro_google_oauth_state";

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim());
}

export function applicationOrigin() {
  const configured = process.env.APP_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidate = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
  const url = new URL(candidate);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid APP_URL");
  return url.origin;
}

export function googleOAuthClient() {
  if (!googleCalendarConfigured()) throw new Error("Google Calendar is not configured");
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID!.trim(), process.env.GOOGLE_CLIENT_SECRET!.trim(), `${applicationOrigin()}/api/google-calendar/callback`);
}
