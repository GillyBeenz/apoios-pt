// Deliberately minimal.
//
// Fund data is always network-first. Serving a cached "aberto" for a programme
// that closed yesterday is precisely the harm this product exists to prevent —
// fast-but-wrong is worse than slow-but-right, so stale funding data is never
// served while the network is reachable.

const CACHE = "apoios-v2";
const SHELL = ["/", "/offline", "/manifest.webmanifest", "/icone.svg"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Only opaque-free, same-origin 200s are worth keeping. */
function guardavel(resposta) {
  return resposta.ok && resposta.type === "basic" && resposta.status === 200;
}

async function redePrimeiro(pedido) {
  try {
    const resposta = await fetch(pedido);
    if (guardavel(resposta)) {
      const copia = resposta.clone();
      caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => undefined);
    }
    return resposta;
  } catch {
    const guardada = await caches.match(pedido);
    if (guardada !== undefined) return guardada;

    // A navigation with nothing cached gets the offline page rather than the
    // browser's own error, which says nothing about why the list is missing.
    if (pedido.mode === "navigate") {
      const offline = await caches.match("/offline");
      if (offline !== undefined) return offline;
    }
    throw new Error("sem rede e sem cópia local");
  }
}

async function cachePrimeiro(pedido) {
  const guardada = await caches.match(pedido);
  if (guardada !== undefined) return guardada;

  const resposta = await fetch(pedido);
  if (guardavel(resposta)) {
    const copia = resposta.clone();
    caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => undefined);
  }
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Build output is content-hashed, so a URL's contents never change and caching
  // it forever is safe. This is the only thing that genuinely is.
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(cachePrimeiro(pedido));
    return;
  }

  // Everything else — every page, not just /apoios — goes to the network first.
  // The old version served HTML cache-first, which pinned whatever a visitor saw
  // the first time: a closed programme kept reading "aberto" for as long as the
  // cache name stayed the same, which is the exact failure the comment at the top
  // says this file exists to avoid.
  evento.respondWith(redePrimeiro(pedido));
});
