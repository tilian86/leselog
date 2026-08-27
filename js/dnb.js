// Deutsche Ausgabe zu einem englischsprachigen Buch finden – über die
// Deutsche Nationalbibliothek (via eigenem CORS-Vermittler, kein Schlüssel nötig).
//
// Sicherster Beleg: Der DNB-Datensatz führt den Originaltitel (MARC 240/246).
// Stimmt der mit dem englischen Titel überein, ist es dieselbe Arbeit.
import { CONFIG } from "./config.js";

const NS = "http://www.loc.gov/MARC21/slim";
const STOP = new Set(["the","a","an","of","and","or","to","in","on","for","how","why",
                      "what","is","your","you","its","from","with"]);

function norm(s) {
  return (s || "").toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function keywords(t) { return norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)); }

// Ähnlichkeit 0..1 über gemeinsame Wörter (reicht für den Titelabgleich)
function similar(a, b) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return (2 * hit) / (A.size + B.size);
}

function field(rec, tag, code) {
  for (const f of rec.getElementsByTagNameNS(NS, "datafield")) {
    if (f.getAttribute("tag") !== tag) continue;
    for (const s of f.getElementsByTagNameNS(NS, "subfield")) {
      if (s.getAttribute("code") === code && s.textContent) return s.textContent.trim();
    }
  }
  return null;
}

async function query(cql, n = 10) {
  const base = CONFIG.DNB_PROXY_URL;
  if (!base) return [];
  const res = await fetch(`${base}?q=${encodeURIComponent(cql)}&n=${n}`);
  if (!res.ok) return [];
  const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
  return [...doc.getElementsByTagNameNS(NS, "record")].map((rec) => ({
    titel: field(rec, "245", "a"),
    zusatz: field(rec, "245", "b"),
    orig: field(rec, "240", "a") || field(rec, "246", "a"),
    jahr: field(rec, "264", "c"),
    verlag: field(rec, "264", "b"),
    isbn: field(rec, "020", "a"),
    lang: field(rec, "041", "a"),
  }));
}

/**
 * Sucht die deutsche Ausgabe. Gibt null zurück, wenn es keine belegte gibt
 * (oder wenn die deutsche Ausgabe genauso heißt – dann lohnt kein Wechsel).
 */
export async function findGermanEdition(titleEn, author) {
  const kws = keywords(titleEn).slice(0, 4);
  if (!kws.length) return null;
  const last = author ? norm(author.split(",")[0]).split(" ").pop() : null;
  const base = kws.map((w) => `WOE=${w}`).join(" and ");
  const versuche = last ? [`${base} and atr=${last}`, base] : [base];

  for (const cql of versuche) {
    let recs = [];
    try { recs = await query(cql); } catch (_) { continue; }
    let best = null;
    for (const r of recs) {
      if (r.lang && r.lang !== "ger") continue;
      const de = (r.titel || "").replace(/[\s/:]+$/, "");
      if (!de || !r.orig) continue;
      const beleg = similar(titleEn, r.orig);      // Originaltitel muss passen
      const gleich = similar(titleEn, de);          // dt. Titel darf nicht derselbe sein
      if (beleg >= 0.8 && gleich < 0.85) {
        if (!best || beleg > best.beleg) {
          best = { titel: de, zusatz: r.zusatz, orig: r.orig, jahr: r.jahr,
                   verlag: r.verlag, isbn: (r.isbn || "").replace(/[^0-9X]/gi, "") || null,
                   beleg: Math.round(beleg * 100) / 100 };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
