// Leselog-Dateien (Cloudflare Worker + R2)
//   PUT    /f/<bookId>          EPUB hochladen       (Supabase-Login nötig)
//   DELETE /f/<bookId>          EPUB löschen         (Supabase-Login nötig)
//   POST   /sign                {book, ttl, download, name} -> {url}  (Supabase-Login nötig)
//   GET    /d/<uid>/<bookId>.epub?e=&dl=&n=&s=   signierter Download (auch zum Teilen)
//   GET    /c/<bookId>.jpg      Cover (öffentlich, die UUID ist nicht zu erraten)
//   POST   /teilen              {book, title, author, desc, cover, name, ttl} -> {url}  Kurzlink (Supabase-Login nötig)
//   GET    /b/<slug>            Teilen-Seite mit Cover + Klappentext (Vorschau in WhatsApp & Co.)
//   GET    /b/<slug>/epub       Download          GET /b/<slug>/cover.jpg   Cover
//   Der Worker „buch“ (worker-buch/) reicht buch.florian-s-thiel.workers.dev/<slug> hierher durch.
// Ablage im Bucket: <uid>/<bookId>.epub, covers/<bookId>.jpg und teilen/<slug>.json

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

// ---------- Kurzlinks mit Vorschau ----------
const SLUG = /^[a-z0-9-]{3,60}$/;
function slugify(t) {
  // Nur der Haupttitel (ohne Untertitel), damit der Link kurz bleibt: „der-steppenwolf-k7x2qa“
  const s = String(t || "").split(/[:(]|\s[–—-]\s|\.\s/)[0].toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length <= 30) return s || "buch";
  return s.slice(0, 31).replace(/-[^-]*$/, "") || s.slice(0, 30);
}
function zufall(n) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % a.length]).join("");
}
const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const klartext = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function kurz(s, n) {
  if (s.length <= n) return s;
  const t = s.slice(0, n); const i = t.lastIndexOf(" ");
  return (i > n * 0.6 ? t.slice(0, i) : t).replace(/[\s,;:.–-]+$/, "") + " …";
}
function groesse(b) {
  if (!b) return "";
  return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}
const datumDE = (sek) => new Date(sek * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

function teilenSeite(r, base, abgelaufen) {
  const titel = r.title || "Ein Buch";
  const kopf = titel + (r.author ? " – " + r.author : "");
  const text = klartext(r.desc);
  const englisch = r.sprache === "en";
  const og = (englisch ? "🇬🇧 Englische Ausgabe. " : "") + (kurz(text, 200) || (r.author ? "von " + r.author : "E-Book"));
  const bild = r.cover ? `${base}/cover.jpg` : "";
  const tage = r.t ? Math.max(1, Math.round((r.e - r.t) / 86400)) : 30;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escH(kopf)}</title>
<meta name="description" content="${escH(og)}">
<meta property="og:type" content="book"><meta property="og:site_name" content="Leselog">
<meta property="og:title" content="${escH(kopf)}">
<meta property="og:description" content="${escH(og)}">
<meta property="og:url" content="${escH(base)}">
${bild ? `<meta property="og:image" content="${escH(bild)}"><meta property="og:image:alt" content="${escH("Cover: " + titel)}"><meta name="twitter:card" content="summary">` : ""}
<style>
:root{--paper:#f7f2e9;--card:#fffdf7;--ink:#2b2622;--soft:#6f6558;--faint:#9c9284;--accent:#9a3b28;--line:rgba(43,38,34,.12);
--serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#171310;--card:#241d17;--ink:#efe6d7;--soft:#b3a794;--faint:#7d7263;--accent:#d9714f;--line:rgba(239,230,215,.14)}}
*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}
main{max-width:560px;margin:0 auto;padding:28px 18px 40px}
.kopf{display:flex;gap:18px;align-items:flex-end}
.cover{width:118px;flex:none;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:var(--card);box-shadow:0 8px 24px rgba(0,0,0,.28)}
.cover img{width:100%;height:100%;object-fit:cover;display:block}
.kopf>div:last-child{min-width:0}
h1{font-family:var(--serif);font-weight:600;font-size:25px;line-height:1.2;margin:0 0 6px;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:break-word}
.autor{color:var(--soft);font-size:16px}
.sprache{margin-top:6px;color:var(--soft);font-size:13.5px;line-height:1.35}
.knopf{display:block;margin:24px 0 8px;padding:15px;border-radius:14px;background:var(--accent);color:#fff;text-align:center;font-weight:650;font-size:16.5px;text-decoration:none}
.hinweis{color:var(--soft);font-size:14px;line-height:1.45;text-align:center;margin:0 4px}
.hinweis b{color:var(--ink);font-weight:600}
.frist{margin:14px 0 0;padding:11px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line);color:var(--soft);font-size:13.5px;line-height:1.45;text-align:center}
.weg{margin:24px 0 8px;padding:15px;border-radius:14px;border:1px solid var(--line);text-align:center;color:var(--soft)}
.text{margin-top:24px;padding-top:18px;border-top:1px solid var(--line);font-family:var(--serif);font-size:17px;line-height:1.55;white-space:pre-line}
footer{margin-top:34px;color:var(--faint);font-size:12.5px;text-align:center}
</style></head><body><main>
<div class="kopf">${bild ? `<div class="cover"><img src="${escH(bild)}" alt=""></div>` : ""}
<div><h1>${escH(titel)}</h1>${r.author ? `<div class="autor">${escH(r.author)}</div>` : ""}${englisch ? `<div class="sprache">🇬🇧 Englische Ausgabe${r.de_titel ? ` · auf Deutsch: „${escH(r.de_titel)}“` : ""}</div>` : ""}</div></div>
${abgelaufen
  ? `<div class="weg">Dieser Link ist abgelaufen. Frag einfach nach einem neuen 🙂</div>`
  : `<a class="knopf" href="${escH(base)}/epub">📖 E-Book herunterladen</a>
<div class="hinweis">Dahinter steckt die <b>${englisch ? "englische " : ""}EPUB-Datei</b>${r.size ? " (" + groesse(r.size) + ")" : ""} – für E‑Reader und Lese‑Apps wie Apple Bücher, Tolino, Kobo, Google Play Bücher oder ElevenReader (Kindle über „Send to Kindle“).</div>
<div class="frist">⏳ Der Download-Link funktioniert ${tage === 1 ? "einen Tag" : tage + " Tage"}, bis ${datumDE(r.e)}.<br>Einmal heruntergeladen, bleibt die Datei für immer bei dir.</div>`}
${text ? `<div class="text">${escH(kurz(text, 2500))}</div>` : ""}
<footer>Geteilt mit Leselog</footer>
</main></body></html>`;
}

async function teilenAbrufen(req, env, url, p) {
  const slug = p[1];
  if (!SLUG.test(slug)) return new Response("nicht gefunden", { status: 404 });
  const o = await env.BUCKET.get("teilen/" + slug + ".json");
  if (!o) return new Response("Diesen Link gibt es nicht.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const r = await o.json();
  const base = env.KURZ_ORIGIN ? `${env.KURZ_ORIGIN}/${slug}` : `${url.origin}/b/${slug}`;
  const abgelaufen = !(r.e > Date.now() / 1000);
  const was = p[2] || "";

  if (was === "cover.jpg") {
    let bild = null;
    if (r.cover === "r2") {
      const c = await env.BUCKET.get("covers/" + r.book + ".jpg");
      if (c) bild = new Response(c.body, { headers: { "Content-Type": c.httpMetadata?.contentType || "image/jpeg" } });
    } else if (/^https?:\/\//.test(r.cover || "")) {
      // Google-Books-Cover sind mit zoom=1 nur 128 px breit – fife=w600 liefert ein scharfes Bild.
      const urls = /books\.google\./.test(r.cover) ? [r.cover.replace(/&fife=[^&]*/, "") + "&fife=w600", r.cover] : [r.cover];
      for (const u of urls) {
        const c = await fetch(u, { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
        if (c && c.ok && (c.headers.get("Content-Type") || "").startsWith("image/")) {
          bild = new Response(c.body, { headers: { "Content-Type": c.headers.get("Content-Type") } });
          break;
        }
      }
    }
    if (!bild) return new Response("kein Cover", { status: 404 });
    bild.headers.set("Cache-Control", "public, max-age=86400");
    return bild;
  }

  if (was === "epub") {
    if (abgelaufen) return new Response("Dieser Link ist abgelaufen.", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const f = await env.BUCKET.get(`${r.uid}/${r.book}.epub`);
    if (!f) return new Response("Datei nicht gefunden.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const name = safeName(r.name || (r.title || "Buch") + ".epub");
    return new Response(f.body, { headers: {
      "Content-Type": "application/epub+zip",
      "Content-Length": String(f.size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    } });
  }

  if (was) return new Response("nicht gefunden", { status: 404 });
  return new Response(req.method === "HEAD" ? null : teilenSeite(r, base, abgelaufen), { status: abgelaufen ? 410 : 200, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Robots-Tag": "noindex, nofollow",
  } });
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

    // Teilen-Seite (Kurzlink)
    if ((req.method === "GET" || req.method === "HEAD") && p[0] === "b" && p.length >= 2 && p.length <= 3) {
      return teilenAbrufen(req, env, url, p);
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

    if (req.method === "POST" && p[0] === "teilen") {
      const b = await req.json().catch(() => ({}));
      if (!UUID.test(b.book || "")) return json({ error: "book fehlt" }, 400, h);
      const f = await env.BUCKET.head(`${uid}/${b.book}.epub`);
      if (!f) return json({ error: "Keine EPUB-Datei zu diesem Buch" }, 404, h);
      const ttl = Math.min(Math.max(Number(b.ttl) || 60 * 60 * 24 * 30, 3600), 60 * 60 * 24 * 30);
      // Cover: eigenes aus R2, sonst die hinterlegte Adresse (Google/Amazon …) – der Worker reicht es durch.
      // Englische Originaldatei an einem deutschen Eintrag: lieber das Cover aus der EPUB (passt zur Datei).
      let cover = "";
      const eigen = String(b.cover || "").match(/\/c\/([0-9a-f-]{36})\.jpg/);
      const englisch = b.sprache === "en";
      if (eigen && UUID.test(eigen[1]) && eigen[1] === b.book) cover = "r2";
      else if (englisch && await env.BUCKET.head("covers/" + b.book + ".jpg")) cover = "r2";
      else if (/^https?:\/\//.test(b.cover || "")) cover = String(b.cover).slice(0, 1000);
      else if (await env.BUCKET.head("covers/" + b.book + ".jpg")) cover = "r2";
      const rec = {
        uid, book: b.book, t: Math.floor(Date.now() / 1000), e: Math.floor(Date.now() / 1000) + ttl, size: f.size,
        title: String(b.title || "").slice(0, 300), author: String(b.author || "").slice(0, 300),
        desc: klartext(b.desc).slice(0, 4000), name: safeName(b.name || (b.title || "Buch") + ".epub"), cover,
        sprache: englisch ? "en" : "", de_titel: englisch ? String(b.de_titel || "").slice(0, 300) : "",
      };
      const slug = slugify(rec.title) + "-" + zufall(6);
      await env.BUCKET.put("teilen/" + slug + ".json", JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
      const kurzUrl = env.KURZ_ORIGIN ? `${env.KURZ_ORIGIN}/${slug}` : `${url.origin}/b/${slug}`;
      return json({ url: kurzUrl, bis: rec.e }, 200, h);
    }

    return json({ error: "unbekannt" }, 404, h);
  },
};
