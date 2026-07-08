// Buch-Metadaten aus dem Netz holen: Google Books (primär) + OpenLibrary (Cover-Fallback)
import { CONFIG } from "./config.js";

function httpsCover(url) {
  if (!url) return null;
  return url
    .replace(/^http:/, "https:")
    .replace(/&edge=curl/, "")
    .replace(/zoom=\d/, "zoom=1");
}

function year(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function normalizeVolume(item) {
  const v = item.volumeInfo || {};
  const ids = v.industryIdentifiers || [];
  const isbn13 = (ids.find((i) => i.type === "ISBN_13") || {}).identifier || null;
  const isbn10 = (ids.find((i) => i.type === "ISBN_10") || {}).identifier || null;
  let cover = httpsCover(v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail));
  if (!cover && isbn13) cover = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
  return {
    title: v.title || "",
    subtitle: v.subtitle || null,
    author: (v.authors && v.authors.join(", ")) || null,
    isbn13, isbn10,
    publisher: v.publisher || null,
    published_year: year(v.publishedDate),
    page_count: v.pageCount || null,
    language: v.language || null,
    cover_url: cover,
    description: v.description || null,
    categories: v.categories || null,
    google_books_id: item.id || null,
    web_rating: v.averageRating != null ? v.averageRating : null,
    web_rating_count: v.ratingsCount != null ? v.ratingsCount : null,
  };
}

// Links zu Buchhandlungen (Osiander direkt per ISBN, Thalia-Suche, Amazon)
export function storeLinks(b) {
  const isbn = b.isbn13 || b.isbn10 || "";
  const term = encodeURIComponent([b.title, b.author].filter(Boolean).join(" ") || isbn);
  const links = [];
  links.push({ name: "Amazon", url: b.isbn10
    ? "https://www.amazon.de/dp/" + b.isbn10
    : "https://www.amazon.de/s?k=" + (isbn || term) + "&i=stripbooks" });
  links.push({ name: "Thalia", url: "https://www.thalia.de/suche?sq=" + (isbn || term) });
  if (isbn) links.push({ name: "Osiander", url: "https://www.osiander.de/details.cfm?isbn=" + isbn });
  return links;
}

// Klappentext + Web-Bewertung für ein Buch nachladen (falls beim Treffer noch nicht dabei,
// z. B. wenn er über OpenLibrary kam). Best effort – Fehler werden verschluckt.
export async function fetchExtras(b) {
  if (b.description && b.web_rating != null) return {};
  try {
    let vol = null;
    if (b.google_books_id) {
      const r = await fetch("https://www.googleapis.com/books/v1/volumes/" + b.google_books_id);
      if (r.ok) vol = (await r.json()).volumeInfo;
    }
    if (!vol) {
      const q = b.isbn13 ? "isbn:" + b.isbn13 : encodeURIComponent([b.title, b.author].filter(Boolean).join(" "));
      const r = await fetch("https://www.googleapis.com/books/v1/volumes?q=" + q + "&maxResults=1");
      if (r.ok) { const j = await r.json(); vol = j.items && j.items[0] && j.items[0].volumeInfo; }
    }
    if (!vol) return {};
    return {
      description: b.description || vol.description || null,
      web_rating: b.web_rating != null ? b.web_rating : (vol.averageRating != null ? vol.averageRating : null),
      web_rating_count: b.web_rating_count != null ? b.web_rating_count : (vol.ratingsCount != null ? vol.ratingsCount : null),
    };
  } catch (_) { return {}; }
}

// Rangfolge: vollständigere Treffer (mit Cover, Seiten, ISBN) nach oben
function score(b) {
  let s = 0;
  if (b.cover_url) s += 3;
  if (b.page_count) s += 2;
  if (b.isbn13) s += 2;
  if (b.author) s += 1;
  if (b.published_year) s += 1;
  return s;
}

async function gbooks(params) {
  const key = CONFIG.GBOOKS_KEY ? "&key=" + CONFIG.GBOOKS_KEY : "";
  const url = "https://www.googleapis.com/books/v1/volumes?" + params + "&maxResults=8&country=DE" + key;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Google Books nicht erreichbar");
  const json = await res.json();
  return (json.items || []).map(normalizeVolume).filter((b) => b.title);
}

// ---- OpenLibrary als Fallback (kein API-Key, kein Tageslimit) ----
const clean = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  return /^(n\/a|n\.a\.?|unknown|unbekannt|null|-+)$/i.test(s) ? null : s;
};
function olNormalize(doc) {
  const isbns = doc.isbn || [];
  const isbn13 = isbns.find((x) => x.length === 13) || null;
  const isbn10 = isbns.find((x) => x.length === 10) || null;
  return {
    title: doc.title || "",
    subtitle: doc.subtitle || null,
    author: clean(doc.author_name && doc.author_name.join(", ")),
    isbn13, isbn10,
    publisher: clean(doc.publisher && doc.publisher[0]),
    published_year: doc.first_publish_year || null,
    page_count: doc.number_of_pages_median || null,
    language: (doc.language && doc.language[0]) || null,
    cover_url: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : (isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg` : null),
    description: null,
    categories: null,
    google_books_id: null,
  };
}
async function olSearch(query) {
  const url = "https://openlibrary.org/search.json?q=" + encodeURIComponent(query) +
    "&limit=6&fields=title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,publisher,language";
  const res = await fetch(url);
  if (!res.ok) return [];
  const d = await res.json();
  return (d.docs || []).map(olNormalize).filter((b) => b.title);
}

function dedupeSort(results) {
  const seen = new Set();
  results = results.filter((b) => {
    const k = (b.title + "|" + (b.author || "")).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  results.sort((a, b) => score(b) - score(a));
  return results.slice(0, 6);
}

// Freitext-Suche ("Soloalbum von Stuckrad-Barre").
// Erst Google Books; wenn das leer/blockiert (429) ist, automatisch OpenLibrary.
export async function searchBooks(query) {
  const q = query.trim();
  if (!q) return [];
  let results = [];
  try { results = await gbooks("q=" + encodeURIComponent(q)); } catch (_) { results = []; }
  if (!results.length) {
    try { results = await olSearch(q); } catch (_) {}
  }
  return dedupeSort(results);
}

// Exakte Suche per ISBN (aus Barcode-Scan)
export async function searchByISBN(isbn) {
  const clean = String(isbn).replace(/[^0-9Xx]/g, "");
  let results = [];
  try { results = await gbooks("q=isbn:" + encodeURIComponent(clean)); } catch (_) {}
  if (results.length) return results[0];
  // Fallback: OpenLibrary
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${clean}.json`);
    if (res.ok) {
      const d = await res.json();
      return {
        title: d.title || "",
        subtitle: d.subtitle || null,
        author: null,
        isbn13: clean.length === 13 ? clean : null,
        isbn10: clean.length === 10 ? clean : null,
        publisher: (d.publishers && d.publishers[0]) || null,
        published_year: year(d.publish_date),
        page_count: d.number_of_pages || null,
        language: null,
        cover_url: `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`,
        description: null,
        categories: null,
        google_books_id: null,
      };
    }
  } catch (_) {}
  return null;
}

// Gesprochenen Satz verstehen: Absicht (gelesen / lese gerade / will lesen) erkennen
// und den eigentlichen Buchtitel aus Füllwörtern herausschälen.
// Beispiel: "Also ich möchte Soloalbum lesen" -> { query: "Soloalbum", status: "want" }
export function parseUtterance(text) {
  const raw = (text || "").trim();
  const t = " " + raw.toLowerCase().replace(/[.!?,;]/g, " ") + " ";

  let status = "read"; // Standard: Logbuch gelesener Bücher
  const wantsToRead =
    (/\b(will|möchte|moechte|wollte|muss|müsste|sollte|würde gern|wuerde gern)\b/.test(t) && /\blesen\b/.test(t)) ||
    /\b(vormerken|vormerk)\b/.test(t) ||
    /(auf (die|meine)|zur).{0,25}(will[- ]?lese|lese ?liste|merk ?liste|wunschliste)/.test(t) ||
    /\bnoch lesen\b/.test(t);
  const currentlyReading =
    /\b(lese|les)\b.{0,15}\b(gerade|grade|zurzeit|zur zeit|aktuell|momentan)\b/.test(t) ||
    /\bgerade (am lesen|dabei|mitten)\b/.test(t) ||
    /\bbin (gerade )?(dabei|mitten|am lesen)\b/.test(t) ||
    /\bam lesen\b/.test(t);
  const alreadyRead =
    /\b(gelesen|durchgelesen|ausgelesen|durch|fertig|beendet)\b/.test(t);

  if (wantsToRead) status = "want";
  else if (currentlyReading) status = "reading";
  else if (alreadyRead) status = "read";

  // Titel herausschälen: Füll- und Absichtswörter entfernen
  let q = raw;
  const strip = [
    /^\s*(also|ähm|aehm|äh|ja|so|hey|okay|ok|nun|und)\b/gi,
    /\bich (möchte|moechte|will|wollte|muss|müsste|würde gern[e]?|wuerde gern[e]?|habe?|hab)\b/gi,
    /\b(möchte|moechte|will|wollte|müsste|sollte)\b/gi,
    /\bgerne?\b/gi, /\bgrade\b/gi, /\bgerade\b/gi, /\bzurzeit\b/gi, /\bzur zeit\b/gi,
    /\baktuell\b/gi, /\bmomentan\b/gi, /\bbin (dabei|mitten|am)\b/gi, /\bam lesen\b/gi,
    /\bdas buch\b/gi, /\bden roman\b/gi, /\bden titel\b/gi, /\bdie geschichte\b/gi,
    /\b(durch)?gelesen\b/gi, /\bausgelesen\b/gi, /\blesen\b/gi, /\blese\b/gi,
    /\bvormerken\b/gi, /\bauf (die|meine) (will[- ]?lese|lese|merk|wunsch)liste\b/gi,
    /\bnoch\b/gi, /\bschon\b/gi, /\bmal\b/gi, /\beinfach\b/gi, /\bjetzt\b/gi,
    /\bfertig\b/gi, /\bbeendet\b/gi, /\bgerade dabei\b/gi,
  ];
  strip.forEach((re) => { q = q.replace(re, " "); });
  q = q.replace(/\s+/g, " ").trim().replace(/^[,:\.\-\s]+|[,:\.\-\s]+$/g, "");

  // Übrig gebliebene Füllwörter am Anfang/Ende abschneiden (Artikel wie "Der/Die"
  // bleiben stehen, weil sie Teil von Titeln sein können; "in/am" nur am Rand).
  const edge = new Set(["ich","hab","habe","hatte","bin","also","so","ja","unbedingt",
    "mal","halt","eben","gerade","grade","mitten","jetzt","in","im","am","an","zu","und","dann","noch"]);
  let toks = q.split(/\s+/).filter(Boolean);
  while (toks.length > 1 && edge.has(toks[0].toLowerCase().replace(/[,.:;]/g, ""))) toks.shift();
  while (toks.length > 1 && edge.has(toks[toks.length - 1].toLowerCase().replace(/[,.:;]/g, ""))) toks.pop();
  q = toks.join(" ").replace(/^[,:\.\-\s]+|[,:\.\-\s]+$/g, "");
  if (!q) q = raw; // niemals leer suchen
  return { query: q, status, rawInput: raw };
}

// Amazon-Link zu einem Buch (ISBN bevorzugt, sonst Titelsuche) – amazon.de
export function amazonUrl(b) {
  if (b.isbn10) return "https://www.amazon.de/dp/" + b.isbn10;
  const term = [b.title, b.author].filter(Boolean).join(" ") || b.isbn13 || "";
  return "https://www.amazon.de/s?k=" + encodeURIComponent(term) + "&i=stripbooks";
}

// Aus einer gesprochenen/getippten Phrase grob Lesedauer erkennen ("3 Tage", "zwei Wochen")
const WORDNUM = { ein:1, eine:1, eins:1, zwei:2, drei:3, vier:4, fünf:5, sechs:6, sieben:7, acht:8, neun:9, zehn:10 };
export function guessReadingDays(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const m = t.match(/(\d+|ein|eine|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\s*(tag|tage|woche|wochen|monat|monate)/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (WORDNUM[m[1]] || null);
  if (!n) return null;
  if (m[2].startsWith("woche")) return n * 7;
  if (m[2].startsWith("monat")) return n * 30;
  return n;
}
