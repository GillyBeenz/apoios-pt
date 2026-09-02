// Deliberately minimal.
//
// The app shell is cached, but fund data is always network-first. Serving a cached
// "aberto" for a programme that closed yesterday is precisely the harm this product
// exists to prevent — fast-but-wrong is worse than slow-but-right, so stale funding
// data is never served while the network is reachable.

const CACHE = "apoios-shell-v1";
const SHELL = ["/", "/offline"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Fund pages: network first, and only fall back to cache when genuinely offline.
  if (url.pathname.startsWith("/apoios")) {
    evento.respondWith(
      fetch(pedido)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => undefined);
          return resposta;
        })
        .catch(() => caches.match(pedido).then((r) => r ?? caches.match("/offline"))),
    );
    return;
  }

  // Everything else: cache first, it is only shell and static assets.
  evento.respondWith(caches.match(pedido).then((r) => r ?? fetch(pedido)));
});
