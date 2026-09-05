import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CompanyStatus, Database, UserRole } from "@/types/database";
import { isProfileLocale, LOCALE_COOKIE } from "@/i18n/config";
import { isCompanyManagerBlocked } from "@/lib/domain/company-access";

const ROLE_HOME: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  installer: "/home",
};

/**
 * Área propia de cada rol. `/messages` queda deliberadamente afuera: es
 * compartida entre empresa, coordinación e instalador.
 *
 * La coordinación es una membresía por empresa dentro del área instalador,
 * no un rol global adicional.
 */
const ROLE_AREAS: Record<UserRole, readonly string[]> = {
  platform_admin: ["/master"],
  company_manager: ["/dashboard"],
  // `/earnings` y no `/finance`: esa ruta ya es del área empresa, y dos áreas
  // no pueden resolver a la misma. Además dice mejor lo que es para quien la
  // usa — son sus ingresos, no las finanzas de una empresa.
  installer: ["/home", "/tasks", "/route", "/jobs", "/earnings", "/profile", "/coordination"],
};

const ALL_AREAS = Object.values(ROLE_AREAS).flat();

/**
 * Rutas públicas (no requieren sesión).
 *
 * `/reset-password` entra acá aunque normalmente se llegue con la sesión de
 * recuperación ya abierta: si el link venció o se abrió en otro navegador, la
 * página necesita poder explicarlo y ofrecer pedir uno nuevo, en vez de rebotar
 * a un login que no dice nada.
 */
const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password"];
const isPublic = (path: string) =>
  PUBLIC_PATHS.includes(path) || path.startsWith("/invite/");

/**
 * Proxy (middleware en Next 16): en cada request refresca la sesión de
 * Supabase y aplica el ruteo por rol. Toda área está protegida salvo las
 * rutas públicas.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  /**
   * Redirige conservando las cookies que Supabase acaba de escribir.
   *
   * `getUser()` puede rotar el token de sesión y, cuando lo hace, deja las
   * cookies nuevas en `response`. Devolver un `NextResponse.redirect` recién
   * creado las descarta: el navegador se queda con el token viejo, ya rotado, y
   * la sesión queda inconsistente. Como el login termina justamente en un
   * redirect, ahí es donde más duele — incluso puede quedar mezclada con restos
   * de la sesión anterior en el mismo navegador.
   */
  const redirectKeepingSession = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

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

  const path = request.nextUrl.pathname;

  // Las rutas /api se guardan a sí mismas y responden JSON (401/403).
  // Redirigirlas a /login devolvería HTML a un cliente que espera JSON.
  if (path.startsWith("/api/")) return response;

  /**
   * Distinguir "no hay sesión" de "Supabase no responde" (OPS-14).
   *
   * Antes esto era un `await` pelado. Cuando Supabase se caía, `user` venía
   * nulo y el middleware mandaba a TODO el mundo a `/login` — una página que
   * tampoco puede autenticar. El síntoma era un cierre de sesión masivo, que
   * es exactamente el diagnóstico equivocado: se pierde tiempo revisando Auth
   * mientras el problema es la base.
   *
   * Ante una falla de infraestructura se deja pasar la petición. No es un
   * agujero: cada layout de área vuelve a resolver el usuario por su cuenta y
   * redirige si no hay. Lo que se gana es que la persona vea un error honesto
   * en vez de creer que la echaron.
   */
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    // Un 401/400 es "no hay sesión" y se trata normal. Un error sin status o
    // 5xx es el servicio, no la credencial.
    if (error && (error.status === undefined || error.status >= 500)) {
      return response;
    }
  } catch {
    return response;
  }

  // Sin sesión: solo rutas públicas.
  if (!user) {
    if (isPublic(path)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return redirectKeepingSession(url);
  }

  // Con sesión: resolvemos el rol.
  //
  // Mismo criterio que arriba: si la consulta falla por infraestructura, dejar
  // pasar. Mandar a `/login` a alguien con sesión válida porque la base no
  // contesta es el peor de los dos errores posibles.
  let profile: { role: string; locale: string; company_id: string | null } | null = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, locale, company_id")
      .eq("id", user.id)
      .single();
    if (error && error.code !== "PGRST116") return response; // PGRST116 = sin filas
    profile = data;
  } catch {
    return response;
  }

  const role = profile?.role as UserRole | undefined;
  if (!profile || !role) {
    // Usuario sin perfil (estado inconsistente): a login limpio.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectKeepingSession(url);
  }

  const home = ROLE_HOME[role];
  if (isProfileLocale(profile.locale)) {
    response.cookies.set(LOCALE_COOKIE, profile.locale, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // El gerente depende de un único tenant. Si quedó suspendido, revocamos la
  // sesión y evitamos que un token todavía vigente llegue al área empresa.
  if (role === "company_manager") {
    // Si esta consulta falla no se puede afirmar que la empresa esté suspendida.
    // Cerrar la sesión ante la duda convertiría una caída de la base en una
    // expulsión con un mensaje falso ("empresa suspendida"), que es peor que
    // dejar pasar: el layout del área vuelve a comprobarlo igual.
    let company: { status: CompanyStatus } | null = null;
    try {
      const { data, error } = profile.company_id
        ? await supabase
            .from("companies")
            .select("status")
            .eq("id", profile.company_id)
            .maybeSingle()
        : { data: null, error: null };
      if (error) return response;
      company = data;
    } catch {
      return response;
    }

    if (isCompanyManagerBlocked(role, company?.status)) {
      await supabase.auth.signOut();
      if (
        path === "/login" &&
        request.nextUrl.searchParams.get("reason") === "company_suspended"
      ) {
        return response;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("reason", "company_suspended");
      return redirectKeepingSession(url);
    }
  }

  // Logueado en login o landing → a su home.
  if (path === "/login" || path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return redirectKeepingSession(url);
  }

  // Intenta entrar a un área que no es la suya → a su home.
  const inSomeArea = ALL_AREAS.some((prefix) => path.startsWith(prefix));
  const inOwnArea = ROLE_AREAS[role].some((prefix) => path.startsWith(prefix));
  if (inSomeArea && !inOwnArea) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return redirectKeepingSession(url);
  }

  return response;
}

export const config = {
  // Excluye estáticos y assets para no correr auth en cada archivo.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
