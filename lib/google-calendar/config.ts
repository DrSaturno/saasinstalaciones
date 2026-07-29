import "server-only";

import { OAuth2Client } from "google-auth-library";
import { applicationOrigin } from "@/lib/app-origin";

// Re-export por compatibilidad: los consumidores de Calendar ya lo importaban
// desde acá cuando la función vivía en este archivo.
export { applicationOrigin };
export { decryptGoogleToken, encryptGoogleToken } from "@/lib/google-calendar/crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "instalapro_google_oauth_state";

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim());
}

export function googleOAuthClient() {
  if (!googleCalendarConfigured()) throw new Error("Google Calendar is not configured");
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID!.trim(), process.env.GOOGLE_CLIENT_SECRET!.trim(), `${applicationOrigin()}/api/google-calendar/callback`);
}
