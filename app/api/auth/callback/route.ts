import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { applicationOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";

const RECOVERY_TYPES: readonly EmailOtpType[] = ["recovery", "email"];

/**
 * Aterrizaje de los links de email de Supabase Auth (hoy: recuperación de
 * contraseña). Canjea el token por una sesión y manda a fijar la clave nueva.
 *
 * Acepta las dos formas que puede tomar el link según cómo esté configurada la
 * plantilla del email:
 *
 * - `token_hash` + `type` — funciona aunque el email se abra en otro dispositivo
 *   o navegador, que es el caso más común: se pide desde la compu y se abre en
 *   el teléfono.
 * - `code` (PKCE) — exige el mismo navegador que originó el pedido, porque el
 *   verificador vive en una cookie de esa sesión. Si no coincide, falla y se
 *   ofrece pedir el link de nuevo.
 */
export async function GET(request: NextRequest) {
  const origin = applicationOrigin();
  const params = request.nextUrl.searchParams;
  const failed = NextResponse.redirect(`${origin}/reset-password?error=link`);

  const supabase = await createClient();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  if (tokenHash && type && RECOVERY_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) return failed;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed;
  } else {
    return failed;
  }

  return NextResponse.redirect(`${origin}/reset-password`);
}
