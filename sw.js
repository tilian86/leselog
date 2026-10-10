// Leselog Service Worker – App-Shell offline verfügbar machen.
const CACHE = "leselog-v12";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=12",
  "./js/config.js",
  "./js/supa.js",
  "./js/enrich.js",
  "./js/audio.js",
  "./js/scan.js",
  "./js/epub.js",
  "./js/io.js",
  "./js/tmdb.js",
  "./js/dnb.js",
  "./js/app.js?v=12",
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
  // Die Module (enrich.js, dnb.js, …) haben kein ?v= – GitHub Pages lässt sie
  // 10 Min im Browser-Cache liegen. Direkt nach einer neuen Fassung passten dann
  // neues app.js und altes Modul nicht zusammen (weiße Seite). Deshalb fragt der
  // SW bei eigenen Dateien (auch der Startseite) immer kurz beim Server nach
  // (no-cache = 304, wenn gleich) – so passt alles zur selben Fassung.
  const frisch = new Request(e.request, { cache: "no-cache" });
  e.respondWith(
    fetch(frisch)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        if (e.request.mode === "navigate") {
          const start = await caches.match("./index.html");
          if (start) return start;
        }
        return Response.error();
      })
  );
});
