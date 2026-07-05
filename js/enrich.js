// Buch-Metadaten aus dem Netz holen: Google Books (primär) + OpenLibrary (Cover-Fallback)

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
  };
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
  const url = "https://www.googleapis.com/books/v1/volumes?" + params + "&maxResults=8";
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
