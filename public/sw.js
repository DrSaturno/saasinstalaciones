/*
 * Service worker de Instala Pro (hecho a mano).
 *
 * Serwist/next no soporta Turbopack, que es lo que usa este proyecto, así que
 * en vez de cambiar el bundler mantenemos un SW mínimo y sin dependencias.
 *
 * Estrategia:
 *  - Estáticos (_next/static, íconos, manifest): stale-while-revalidate → la
 *    app shell carga sus recursos sin depender de una cuenta.
 *  - Pantallas de campo: network-first y fallback a la última visita. La app
 *    borra esta caché antes de cambiar de cuenta o cerrar sesión, por lo que el
 *    HTML privado nunca se reutiliza entre identidades.
 *  - Todo lo demás (incluido Supabase, otro origen): pasa directo a la red. Las
 *    mutaciones offline las maneja la cola en Dexie, no el SW.
 */
const VERSION = "v7";

const STATIC_CACHE = `static-${VERSION}`;
const FIELD_CACHE = `field-${VERSION}`;
const FIELD_ROUTES = [
  /^\/home$/,
  /^\/tasks(?:\/|$)/,
  /^\/schedule$/,
  /^\/route$/,
  /^\/jobs(?:\/|$)/,
  /^\/earnings$/,
  /^\/coordination$/,
];

function isFieldRoute(pathname) {
  return FIELD_ROUTES.some((pattern) => pattern.test(pathname));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Permite limpiar la caché al cerrar sesión (evita datos de otra cuenta).
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
    return;
  }

  if (event.data?.type === "cache-current-route") {
    const url = new URL(event.data.url, self.location.origin);
    if (url.origin !== self.location.origin || !isFieldRoute(url.pathname)) return;
    event.waitUntil(
      fetch(url.href, { credentials: "include" })
        .then(async (response) => {
          if (!response.ok) return;
          const cache = await caches.open(FIELD_CACHE);
          // Este fetch trae el documento, no el payload RSC: se guarda con la
          // clave del documento para que no se sirva en lugar del otro.
          await cache.put(cacheKey(url.href, "doc"), response.clone());
        })
        .catch(() => undefined),
    );
  }
});

/*
 * Una pantalla viaja en DOS representaciones distintas: el documento HTML de
 * la carga inicial y el payload RSC que el router pide al navegar dentro de la
 * app. Comparten URL, así que compartir clave de caché hace que una se sirva
 * en lugar de la otra: el router recibe HTML donde espera un stream y la
 * navegación muere con un TypeError que se arregla solo al recargar. Por eso
 * la clave lleva la representación adentro.
 *
 * De paso se saca `_rsc`, que Next regenera en cada navegación: dejándolo, la
 * entrada guardada nunca vuelve a encontrarse.
 */
function isRscRequest(request) {
  if (request.headers && request.headers.get("RSC") === "1") return true;
  return new URL(request.url).searchParams.has("_rsc");
}

function cacheKey(url, kind) {
  const target = new URL(url);
  target.searchParams.delete("_rsc");
  target.hash = "";
  target.searchParams.set("__sw", kind);
  return target.href;
}

function requestKey(request) {
  return cacheKey(request.url, isRscRequest(request) ? "rsc" : "doc");
}

/*
 * `ignoreVary` va de la mano de la clave propia: Next responde estas rutas con
 * `Vary: RSC, ...`, y al buscar por una URL construida a mano el navegador no
 * tiene esas cabeceras para comparar y nunca acertaría. La distinción que el
 * `Vary` protege ya está resuelta en la clave.
 */
const MATCH = { ignoreVary: true };

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // La respuesta ya salió; la revalidación corre atrás y su fallo no importa.
    fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
      })
      .catch(() => undefined);
    return cached;
  }

  // Sin copia local no hay nada que servir: se devuelve la respuesta real, aun
  // si falla. Antes este camino terminaba resolviendo en `undefined`, y un
  // `respondWith` que no recibe una Response convierte un tropezón de red en
  // un error duro del chunk. Con módulos que aún no se abrieron en la sesión
  // —que es justo lo que pasa al saltar de una sección a otra— eso rompe la
  // pantalla entera en vez de reintentar.
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = requestKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key, MATCH);
    if (cached) return cached;
    // Sin copia de ESTA representación, el error de red se propaga tal cual.
    // Devolver la otra sería darle al router algo que no sabe leer.
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase y demás: a la red.

  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isFieldRoute(url.pathname)) {
    event.respondWith(networkFirst(request, FIELD_CACHE));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Instala Pro", body: event.data.text(), url: "/" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Instala Pro", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
      tag: payload.tag || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
