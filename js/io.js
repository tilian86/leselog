// Import & Export der Bücherliste – CSV (auch Goodreads-Format) und JSON.

const EXPORT_COLUMNS = [
  ["Title", "title"],
  ["Author", "author"],
  ["Type", "media_type"],
  ["ISBN", "isbn10"],
  ["ISBN13", "isbn13"],
  ["Publisher", "publisher"],
  ["Year", "published_year"],
  ["Pages", "page_count"],
  ["Season", "season"],
  ["Episode", "episode"],
  ["Seasons", "total_seasons"],
  ["Episodes", "total_episodes"],
  ["Runtime", "runtime"],
  ["Rating", "rating"],
  ["Status", "status"],
  ["Started", "date_started"],
  ["Finished", "date_finished"],
  ["Notes", "notes"],
];

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function booksToCSV(books) {
  const head = EXPORT_COLUMNS.map(([h]) => h).join(",");
  const rows = books.map((b) =>
    EXPORT_COLUMNS.map(([, key]) => csvCell(b[key])).join(","));
  return "﻿" + [head, ...rows].join("\r\n"); // BOM für Excel/Umlaute
}

export function booksToJSON(books) {
  const clean = books.map(({ id, user_id, created_at, updated_at, ...rest }) => rest);
  return JSON.stringify({ app: "leselog", exported: new Date().toISOString(), books: clean }, null, 2);
}

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- CSV robust parsen (Anführungszeichen, Kommas, Zeilenumbrüche) ----
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === "," || c === ";") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Spalten flexibel zuordnen (eigene Exporte + Goodreads + deutsche Header)
const FIELD_ALIASES = {
  title: ["title", "titel", "buchtitel"],
  author: ["author", "autor", "autor:in", "authors", "verfasser"],
  isbn13: ["isbn13", "isbn-13", "isbn 13"],
  isbn10: ["isbn", "isbn10", "isbn-10"],
  publisher: ["publisher", "verlag"],
  published_year: ["year", "year published", "jahr", "erscheinungsjahr", "original publication year"],
  page_count: ["pages", "number of pages", "seiten", "seitenzahl"],
  rating: ["rating", "my rating", "bewertung", "sterne"],
  status: ["status", "exclusive shelf", "shelf", "regal", "bookshelves"],
  date_started: ["started", "date started", "date added", "angefangen", "begonnen"],
  date_finished: ["finished", "date read", "beendet", "gelesen am", "read date"],
  notes: ["notes", "notizen", "my review", "review", "gedanken", "kommentar"],
  media_type: ["type", "typ", "medium", "media_type"],
  season: ["season", "staffel"],
  episode: ["episode", "folge"],
  total_seasons: ["seasons", "staffeln"],
  total_episodes: ["episodes", "folgen"],
  runtime: ["runtime", "laufzeit"],
};

function cleanIsbn(v) { return v ? String(v).replace(/[^0-9Xx]/g, "") : ""; }

function mapStatus(v) {
  const s = String(v || "").toLowerCase();
  if (/to-?read|to read|want|will|wunsch|merk/.test(s)) return "want";
  if (/currently|reading|lese|gerade/.test(s)) return "reading";
  return "read";
}

// Datei -> normalisierte Buch-Objekte (bereit für den Import)
export async function parseImportFile(file) {
  const text = await file.text();
  let raw = [];

  if (/\.json$/i.test(file.name) || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    const data = JSON.parse(text);
    raw = Array.isArray(data) ? data : (data.books || []);
    return raw.map(normalizeRecord).filter((b) => b.title);
  }

  // CSV
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const i = headers.findIndex((h) => aliases.includes(h));
    if (i >= 0) idx[field] = i;
  }
  // Kein bekannter Header? Dann 1. Spalte = Titel, 2. = Autor
  if (idx.title == null) { idx.title = 0; if (idx.author == null && headers.length > 1) idx.author = 1; }

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (f) => (idx[f] != null ? (row[idx[f]] || "").trim() : "");
    const rec = normalizeRecord({
      title: get("title"),
      author: get("author"),
      media_type: get("media_type"),
      isbn13: cleanIsbn(get("isbn13")) || (cleanIsbn(get("isbn10")).length === 13 ? cleanIsbn(get("isbn10")) : ""),
      isbn10: cleanIsbn(get("isbn10")).length === 10 ? cleanIsbn(get("isbn10")) : "",
      publisher: get("publisher"),
      published_year: get("published_year"),
      page_count: get("page_count"),
      season: get("season"),
      episode: get("episode"),
      total_seasons: get("total_seasons"),
      total_episodes: get("total_episodes"),
      runtime: get("runtime"),
      rating: get("rating"),
      status: get("status"),
      date_started: get("date_started"),
      date_finished: get("date_finished"),
      notes: get("notes"),
    });
    if (rec.title) out.push(rec);
  }
  return out;
}

function toYear(v) { const m = String(v || "").match(/\d{4}/); return m ? parseInt(m[0], 10) : null; }
function toDate(v) { const m = String(v || "").match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; }
function toInt(v) { const n = parseInt(String(v || "").replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; }

function mapType(v) {
  const s = String(v || "").toLowerCase();
  if (/movie|film/.test(s)) return "movie";
  if (/series|serie|tv|show/.test(s)) return "series";
  return "book";
}

function normalizeRecord(r) {
  const mt = mapType(r.media_type);
  const media = mt !== "book";
  const isbn13 = r.isbn13 ? cleanIsbn(r.isbn13) : null;
  const isbn10 = r.isbn10 ? cleanIsbn(r.isbn10) : null;
  const rating = toInt(r.rating);
  let cover = r.cover_url || null;
  if (!media && !cover && isbn13) cover = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
  else if (!media && !cover && isbn10) cover = `https://covers.openlibrary.org/b/isbn/${isbn10}-L.jpg`;
  return {
    title: (r.title || "").trim(),
    author: r.author ? String(r.author).trim() : null,
    media_type: mt,
    isbn13: !media && isbn13 && isbn13.length === 13 ? isbn13 : null,
    isbn10: !media && isbn10 && isbn10.length === 10 ? isbn10 : null,
    publisher: !media && r.publisher ? String(r.publisher).trim() : null,
    published_year: r.published_year ? (toYear(r.published_year) || toInt(r.published_year)) : null,
    page_count: media ? null : toInt(r.page_count),
    season: media ? toInt(r.season) : null,
    episode: media ? toInt(r.episode) : null,
    total_seasons: media ? toInt(r.total_seasons) : null,
    total_episodes: media ? toInt(r.total_episodes) : null,
    runtime: mt === "movie" ? toInt(r.runtime) : null,
    tmdb_id: media ? (toInt(r.tmdb_id) || null) : null,
    description: r.description ? String(r.description).trim() : null,
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
    status: mapStatus(r.status),
    date_started: toDate(r.date_started),
    date_finished: toDate(r.date_finished),
    notes: r.notes ? String(r.notes).trim() : null,
    cover_url: cover,
    source: "import",
  };
}
