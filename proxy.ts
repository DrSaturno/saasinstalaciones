import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types/database";

const ROLE_HOME: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  installer: "/tasks",
};

const ROLE_PREFIX: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  installer: "/tasks",
};

// Rutas públicas (no requieren sesión).
const PUBLIC_PATHS = ["/", "/login"];
const isPublic = (path: string) =>
  PUBLIC_PATHS.includes(path) || path.startsWith("/invite/");

/**
 * Proxy (middleware en Next 16): en cada request refresca la sesión de
 * Supabase y aplica el ruteo por rol. Toda área está protegida salvo las
 * rutas públicas.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Sin sesión: solo rutas públicas.
  if (!user) {
    if (isPublic(path)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Con sesión: resolvemos el rol.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  if (!role) {
    // Usuario sin perfil (estado inconsistente): a login limpio.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const home = ROLE_HOME[role];

  // Logueado en login o landing → a su home.
  if (path === "/login" || path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Intenta entrar a un área que no es la suya → a su home.
  const allowedPrefix = ROLE_PREFIX[role];
  const inSomeArea = Object.values(ROLE_PREFIX).some((p) => path.startsWith(p));
  if (inSomeArea && !path.startsWith(allowedPrefix)) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Excluye estáticos y assets para no correr auth en cada archivo.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
