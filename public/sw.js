// v4: ob posodobitvi pobriše stare predpomnilnike (stari manifest "standalone").
const CACHE_NAME = "komadi-cache-v4";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate za ostale lastne (same-origin) GET zahteve — omogoča, da
// se app shell odpre tudi brez povezave. Klici proti Supabase (drug izvor)
// gredo vedno neposredno na omrežje.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Stran (navigacija) in manifest: najprej omrežje, predpomnilnik samo brez
  // povezave — sicer ob namestitvi/posodobitvi aplikacije brskalnik dobi star
  // manifest (npr. "display") in staro stran z zastarelimi povezavami na kodo.
  if (event.request.mode === "navigate" || url.pathname.endsWith("/manifest.json")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
