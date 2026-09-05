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
const VERSION = "v6";

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
          await cache.put(url.href, response.clone());
        })
        .catch(() => undefined),
    );
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const exact = await cache.match(request);
    if (exact) return exact;

    // Next agrega un parámetro efímero a los requests RSC. El pathname sigue
    // identificando la misma pantalla visitada y es un fallback mejor que una
    // navegación rota cuando no hay señal.
    const byPath = await cache.match(request, { ignoreSearch: true });
    if (byPath) return byPath;
    throw new Error("offline_route_not_cached");
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
