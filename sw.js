// Leselog Service Worker – App-Shell offline verfügbar machen.
const CACHE = "leselog-v2";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/supa.js",
  "./js/enrich.js",
  "./js/audio.js",
  "./js/scan.js",
  "./js/epub.js",
  "./js/io.js",
  "./js/tmdb.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nur GET und nur eigene Dateien cachen. API-Aufrufe (Supabase, Google Books) immer live.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first: immer die frischste Version holen, Cache nur als Offline-Fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
