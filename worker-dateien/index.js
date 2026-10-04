// Leselog-Dateien (Cloudflare Worker + R2)
//   PUT    /f/<bookId>          EPUB hochladen       (Supabase-Login nötig)
//   DELETE /f/<bookId>          EPUB löschen         (Supabase-Login nötig)
//   POST   /sign                {book, ttl, download, name} -> {url}  (Supabase-Login nötig)
//   GET    /d/<uid>/<bookId>.epub?e=&dl=&n=&s=   signierter Download (auch zum Teilen)
//   GET    /c/<bookId>.jpg      Cover (öffentlich, die UUID ist nicht zu erraten)
// Ablage im Bucket: <uid>/<bookId>.epub und covers/<bookId>.jpg

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX = 100 * 1024 * 1024;
const userCache = new Map();

function cors(req, env) {
  const o = req.headers.get("Origin") || "";
  const ok = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": ok.includes(o) ? o : ok[0],
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Vary": "Origin",
  };
}
const json = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { ...h, "Content-Type": "application/json" } });

async function userId(req, env) {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const c = userCache.get(tok);
  if (c && c.t > Date.now()) return c.id;
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_KEY, Authorization: "Bearer " + tok } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u || !u.id) return null;
  userCache.set(tok, { id: u.id, t: Date.now() + 5 * 60 * 1000 });
  return u.id;
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeName(n) {
  return String(n || "Buch.epub").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 150) || "Buch.epub";
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const url = new URL(req.url);
    const p = url.pathname.split("/").filter(Boolean);

    // Cover: öffentlich
    if (req.method === "GET" && p[0] === "c" && p.length === 2) {
      const id = p[1].replace(/\.jpg$/, "");
      if (!UUID.test(id)) return new Response("nicht gefunden", { status: 404 });
      const o = await env.BUCKET.get("covers/" + id + ".jpg");
      if (!o) return new Response("nicht gefunden", { status: 404 });
      return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=2592000", "Access-Control-Allow-Origin": "*" } });
    }

    // Signierter Download
    if (req.method === "GET" && p[0] === "d" && p.length === 3) {
      const [, uid, file] = p;
      const bid = file.replace(/\.epub$/, "");
      if (!UUID.test(uid) || !UUID.test(bid)) return new Response("nicht gefunden", { status: 404 });
      const e = url.searchParams.get("e") || "", dl = url.searchParams.get("dl") || "0", n = url.searchParams.get("n") || "", s = url.searchParams.get("s") || "";
      if (!(Number(e) > Date.now() / 1000)) return new Response("Dieser Link ist abgelaufen.", { status: 410 });
      if (s !== await hmac(env.SIGN_SECRET, `${uid}/${bid}|${e}|${dl}|${n}`)) return new Response("Ungültiger Link.", { status: 403 });
      const o = await env.BUCKET.get(`${uid}/${bid}.epub`);
      if (!o) return new Response("Datei nicht gefunden.", { status: 404 });
      const name = safeName(n || "Buch.epub");
      return new Response(o.body, { headers: {
        "Content-Type": "application/epub+zip",
        "Content-Length": String(o.size),
        "Content-Disposition": `${dl === "1" ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=3600",
      } });
    }

    // Ab hier nur mit Login
    const uid = await userId(req, env);
    if (!uid) return json({ error: "Nicht angemeldet" }, 401, h);

    if (p[0] === "f" && p.length === 2 && UUID.test(p[1])) {
      const key = `${uid}/${p[1]}.epub`;
      if (req.method === "PUT") {
        const len = Number(req.headers.get("Content-Length") || 0);
        if (len > MAX) return json({ error: "Datei zu groß (max. 100 MB)" }, 413, h);
        const o = await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: "application/epub+zip" } });
        return json({ path: "r2:" + key, size: o.size }, 200, h);
      }
      if (req.method === "DELETE") {
        await env.BUCKET.delete(key);
        return json({ ok: true }, 200, h);
      }
    }

    if (req.method === "POST" && p[0] === "sign") {
      const b = await req.json().catch(() => ({}));
      if (!UUID.test(b.book || "")) return json({ error: "book fehlt" }, 400, h);
      const ttl = Math.min(Math.max(Number(b.ttl) || 3600, 60), 60 * 60 * 24 * 30);
      const e = String(Math.floor(Date.now() / 1000) + ttl), dl = b.download ? "1" : "0", n = safeName(b.name);
      const s = await hmac(env.SIGN_SECRET, `${uid}/${b.book}|${e}|${dl}|${n}`);
      const q = new URLSearchParams({ e, dl, n, s });
      return json({ url: `${url.origin}/d/${uid}/${b.book}.epub?${q}` }, 200, h);
    }

    return json({ error: "unbekannt" }, 404, h);
  },
};
