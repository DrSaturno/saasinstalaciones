/*
 * Service worker de Instala Pro (hecho a mano).
 *
 * Serwist/next no soporta Turbopack, que es lo que usa este proyecto, así que
 * en vez de cambiar el bundler mantenemos un SW mínimo y sin dependencias.
 *
 * Estrategia:
 *  - Estáticos (_next/static, íconos, manifest): stale-while-revalidate → la
 *    app "shell" abre al instante y sin señal.
 *  - Navegaciones a /tasks: network-first con fallback a caché → el instalador
 *    ve su última lista/tarea aunque esté sin conexión.
 *  - Todo lo demás (incluido Supabase, otro origen): pasa directo a la red. Las
 *    mutaciones offline las maneja la cola en Dexie, no el SW.
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

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
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Sin caché ni red: intentamos servir el shell de /tasks.
    const shell = await cache.match("/tasks");
    if (shell) return shell;
    throw new Error("offline");
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

  // Sólo cacheamos navegaciones del área instalador.
  if (request.mode === "navigate" && url.pathname.startsWith("/tasks")) {
    event.respondWith(networkFirst(request, PAGE_CACHE));
  }
});
