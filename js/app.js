// Leselog – App-Steuerung
import { CONFIG } from "./config.js";
import { currentSession, onAuth, signInPassword, signUpPassword, signOut,
         fetchBooks, insertBook, insertBooks, updateBook, removeBook } from "./supa.js";
import { searchBooks, searchByISBN, guessReadingDays, parseUtterance, storeLinks, fetchExtras } from "./enrich.js";
import { startDictation, hasMic } from "./audio.js";
import { startScanner } from "./scan.js";
import { readEpubMeta } from "./epub.js";
import { booksToCSV, booksToJSON, download, parseImportFile } from "./io.js";
import { searchMedia, getMediaDetails, tmdbUrl } from "./tmdb.js";

// ---------------- Icons ----------------
const I = {
  mic: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
  plus: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  search: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  shelf: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16"/><path d="M8 4v16"/><path d="M12 5l4 15"/><path d="M20 20V4"/></svg>',
  stats: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/></svg>',
  scan: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
  epub: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  chevron: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  info: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  list: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  grid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  sort: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h12"/><path d="M3 12h9"/><path d="M3 18h6"/><path d="M17 8V19"/><path d="M14 16l3 3 3-3"/></svg>',
};

// ---------------- State ----------------
const state = { session: null, books: [], filter: "all", search: "", view: "shelf",
  layout: localStorage.getItem("leselog_layout") || "grid",
  sort: localStorage.getItem("leselog_sort") || "added",
  mediaType: localStorage.getItem("leselog_media") || "book" };

const MEDIA = [["book", "📚", "Bücher"], ["movie", "🎬", "Filme"], ["series", "📺", "Serien"]];
const isMediaType = (mt) => mt === "movie" || mt === "series";
function typeName(mt) { return (MEDIA.find((m) => m[0] === (mt || state.mediaType)) || MEDIA[0])[2]; }
function statusLabel(status, mt) {
  const book = { read: "Gelesen", reading: "Lese gerade", want: "Will lesen", dropped: "Abgebrochen" };
  const media = { read: "Gesehen", reading: "Schaue gerade", want: "Will sehen", dropped: "Abgebrochen" };
  return (isMediaType(mt || state.mediaType) ? media : book)[status] || status;
}

const SORTS = [
  ["added", "Zuletzt hinzugefügt"],
  ["read", "Zuletzt gelesen"],
  ["title", "Titel (A–Z)"],
  ["author", "Autor (A–Z)"],
  ["rating", "Beste Bewertung"],
  ["pages", "Seitenzahl"],
];

// Vorschau-Modus (index.html#demo): Design ohne Login/DB ansehen. In Produktion unsichtbar.
const DEMO = location.hash.includes("demo");
const DEMO_BOOKS = [
  { id: "d1", title: "Soloalbum", author: "Benjamin von Stuckrad-Barre", page_count: 240, published_year: 1998, publisher: "Kiepenheuer & Witsch", status: "read", rating: 4, date_finished: "2026-01-15", cover_url: null, isbn13: "9783462027004", isbn10: "3462027000", web_rating: 3.6, web_rating_count: 214, description: "Ein junger Musikjournalist stürzt nach dem Ende einer Beziehung in eine Krise: zwischen Plattenrezensionen, Popkultur und Liebeskummer erzählt Stuckrad-Barres Debüt vom Lebensgefühl einer Generation – rasant, komisch und voller Musik." },
  { id: "d2", title: "Tschick", author: "Wolfgang Herrndorf", page_count: 248, published_year: 2010, publisher: "Rowohlt", status: "read", rating: 5, highlight: true, date_finished: "2026-03-10", cover_url: "https://covers.openlibrary.org/b/id/8418261-L.jpg", isbn13: "9783871347108", web_rating: 4.4, web_rating_count: 1893, description: "Maik und der Russlanddeutsche Tschick brechen in einem geklauten Lada zu einer Reise durch die ostdeutsche Provinz auf – eine warmherzige, komische Coming-of-Age-Geschichte über Freundschaft und den Sommer des Lebens." },
  { id: "d3", title: "Die Vermessung der Welt", author: "Daniel Kehlmann", page_count: 272, published_year: 2005, publisher: "Rowohlt", status: "reading", rating: 0, cover_url: "https://covers.openlibrary.org/b/id/1165201-L.jpg" },
  { id: "d4", title: "Der Steppenwolf", author: "Hermann Hesse", page_count: 224, published_year: 1927, publisher: "S. Fischer", status: "read", rating: 5, highlight: true, date_finished: "2026-03-22", cover_url: "https://covers.openlibrary.org/b/id/3221083-L.jpg" },
  { id: "d5", title: "Nachts ist es leiser in Teheran", author: "Shida Bazyar", page_count: 288, published_year: 2016, status: "want", rating: 0, cover_url: null },
  { id: "d6", title: "Der Turm", author: "Uwe Tellkamp", page_count: 976, published_year: 2008, publisher: "Suhrkamp", status: "dropped", rating: 2, abandon_reason: "Nach 200 Seiten hängengeblieben – zu ausschweifend, kam nicht rein.", date_started: "2026-02-01", cover_url: null },
  { id: "m1", media_type: "movie", title: "Matrix", author: "Lana & Lilly Wachowski", published_year: 1999, runtime: 136, status: "read", rating: 5, date_finished: "2026-02-10", web_rating: 4.1, web_rating_count: 24000, tmdb_id: 603, cover_url: "https://image.tmdb.org/t/p/w500/iVmDLujHcV1zaMnaahKWn4TcCS6.jpg", description: "Der Hacker Neo entdeckt, dass die Wirklichkeit eine Computersimulation ist, und schließt sich dem Widerstand gegen die Maschinen an." },
  { id: "s1", media_type: "series", title: "Dark", author: "Baran bo Odar, Jantje Friese", published_year: 2017, total_seasons: 3, total_episodes: 26, season: 2, episode: 5, status: "reading", rating: 5, web_rating: 4.3, web_rating_count: 5200, tmdb_id: 70523, cover_url: "https://image.tmdb.org/t/p/w500/7yQyDCqSazrYTnmxdQLAZ8YDH87.jpg", description: "In der Kleinstadt Winden verschwinden Kinder – eine Zeitreise-Mystery über vier Familien und die Abgründe der Zeit." },
];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

// ---------------- Toast ----------------
let toastT;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------------- Sheet ----------------
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  $("#sheet-scrim").classList.add("show");
  $("#sheet").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  $("#sheet-scrim").classList.remove("show");
  $("#sheet").classList.remove("show");
  document.body.style.overflow = "";
  if (activeScanner) { activeScanner.stop(); activeScanner = null; }
  if (activeDictation) { activeDictation.cancel(); activeDictation = null; }
}

// ---------------- Cover ----------------
function amazonCover(b) {
  return b && b.isbn10 ? `https://images-na.ssl-images-amazon.com/images/P/${b.isbn10}.01._SCLZZZZZZZ_.jpg` : "";
}
// <img> mit Fallback-Kette: hinterlegtes Cover -> Amazon per ISBN -> Titel-Kachel.
// onload prüft auf Amazons 1x1-Platzhalter (naturalWidth < 10) und entfernt ihn dann.
function coverImg(b) {
  const amz = amazonCover(b);
  const src = b.cover_url || amz;
  if (!src) return "";
  return `<img src="${esc(src)}" alt="" loading="lazy" data-amz="${esc(amz)}"` +
    ` onload="if(this.naturalWidth&amp;&amp;this.naturalWidth&lt;10)this.remove()"` +
    ` onerror="var a=this.dataset.amz;if(a&amp;&amp;this.src.indexOf(a)===-1){this.src=a}else{this.remove()}">`;
}
function coverHTML(b, cls = "") {
  const status = b.status && b.status !== "read"
    ? `<span class="badge-status ${b.status}">${statusLabel(b.status, b.media_type)}</span>` : "";
  const hl = b.highlight ? `<span class="badge-highlight" title="Highlight">★</span>` : "";
  // Fallback (Titel/Autor auf Buchrücken) liegt immer darunter; das Bild deckt es ab.
  const fallback = `<div class="cover-fallback"><div class="ft">${esc(b.title)}</div><div class="fa">${esc(b.author || "")}</div></div>`;
  return `<div class="cover-wrap ${cls}">${hl}${status}${fallback}${coverImg(b)}</div>`;
}
function stars(n) { return n ? "★".repeat(n) + "☆".repeat(5 - n) : ""; }
function escPlain(s) { return esc(String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()); }
function webRatingHTML(b) {
  if (!b.web_rating) return "";
  const src = isMediaType(b.media_type) ? "· TMDb" : "· Google Books";
  return `<span class="wr-star">★</span> ${(+b.web_rating).toFixed(1)}` +
    (b.web_rating_count ? ` <span class="wr-count">(${(+b.web_rating_count).toLocaleString("de-DE")})</span>` : "") +
    ` <span class="wr-src">${src}</span>`;
}
function storeLinksHTML(b) {
  return storeLinks(b).map((s) =>
    `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join("");
}
function klappentextHTML(b) {
  if (!b.description) return "";
  const label = isMediaType(b.media_type) ? "Handlung" : "Klappentext";
  return `<div class="klappentext"><div class="kt-label">${label}</div>
    <p class="kt-text clamp">${escPlain(b.description)}</p></div>`;
}

// ================================================================
//  Rendering: Auth vs Main
// ================================================================
async function renderScreen() {
  const screen = $("#screen");
  if (!state.session) {
    document.body.style.paddingBottom = "0";
    screen.innerHTML = `
      <div class="auth">
        <div class="logo">${I.book}</div>
        <h1>Leselog</h1>
        <p>Dein persönliches Regal für alle gelesenen Bücher.</p>
        <input class="input" id="email" type="email" inputmode="email" autocomplete="email"
               placeholder="deine@email.de" />
        <input class="input" id="pw" type="password" autocomplete="current-password"
               placeholder="Passwort" style="margin-top:10px" />
        <button class="btn primary block" id="loginBtn" style="margin-top:12px">Anmelden</button>
        <p style="margin-top:16px;font-size:13px">Beim ersten Mal wird dein Konto automatisch angelegt. Danach bleibst du auf diesem Gerät angemeldet.</p>
      </div>`;
    const login = async () => {
      const email = $("#email").value.trim();
      const password = $("#pw").value;
      if (!email || !password) return toast("E-Mail und Passwort eingeben");
      if (password.length < 6) return toast("Passwort: mindestens 6 Zeichen");
      const btn = $("#loginBtn");
      btn.innerHTML = '<span class="spin"></span>'; btn.disabled = true;
      try {
        await signInPassword(email, password); // onAuth rendert die App
      } catch (e) {
        // Noch kein Konto? Dann anlegen.
        try { await signUpPassword(email, password); toast("Konto erstellt – willkommen! 📚"); }
        catch (e2) {
          const msg = /already registered|already exists|registered/i.test(e2.message || "")
            ? "Falsches Passwort" : (e2.message || e.message || "Anmeldung fehlgeschlagen");
          toast(msg); btn.innerHTML = "Anmelden"; btn.disabled = false;
        }
      }
    };
    $("#loginBtn").onclick = login;
    $("#pw").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    return;
  }

  document.body.style.paddingBottom = "";
  screen.innerHTML = `
    <div class="topbar">
      <div class="app brand-row">
        <div class="brand"><span class="mark">${I.book}</span><h1>Leselog</h1></div>
        <span class="count-pill" id="countPill"></span>
      </div>
      <div class="app"><div class="media-tabs" id="mediaTabs">
        ${MEDIA.map(([m, ic, l]) => `<button data-m="${m}" class="${state.mediaType === m ? "on" : ""}"><span class="mt-ic">${ic}</span>${l}</button>`).join("")}
      </div></div>
    </div>
    <main class="app" id="main"></main>
    <div class="dock">
      <button class="tab" data-view="shelf">${I.shelf}<span>Regal</span></button>
      <button class="fab" id="addFab">${I.plus}</button>
      <button class="tab" data-view="stats">${I.stats}<span>Statistik</span></button>
    </div>`;
  $("#addFab").onclick = openAdd;
  screen.querySelectorAll(".dock .tab").forEach((t) => {
    t.onclick = () => { state.view = t.dataset.view; renderMain(); };
  });
  screen.querySelectorAll("#mediaTabs button").forEach((t) => {
    t.onclick = () => {
      state.mediaType = t.dataset.m;
      localStorage.setItem("leselog_media", state.mediaType);
      state.filter = "all"; state.search = "";
      document.querySelectorAll("#mediaTabs button").forEach((x) => x.classList.toggle("on", x === t));
      renderMain();
    };
  });
  await loadBooks();
}

function renderMain() {
  const main = $("#main");
  if (!main) return;
  const mediaBooks = state.books.filter((b) => (b.media_type || "book") === state.mediaType);
  const one = { book: "Buch", movie: "Film", series: "Serie" }[state.mediaType];
  $("#countPill").textContent = mediaBooks.length + " " + (mediaBooks.length === 1 ? one : typeName());
  document.querySelectorAll(".dock .tab").forEach((t) =>
    t.classList.toggle("on", t.dataset.view === state.view));

  if (state.view === "stats") return renderStats(main);

  const filters = [["all", "Alle"], ["read", statusLabel("read")], ["reading", statusLabel("reading")],
    ["want", statusLabel("want")], ["dropped", statusLabel("dropped")], ["highlight", "★ Highlights"]];
  const counts = { all: mediaBooks.length, read: 0, reading: 0, want: 0, dropped: 0, highlight: 0 };
  mediaBooks.forEach((b) => { const s = b.status || "read"; if (counts[s] != null) counts[s]++;
    if (b.highlight) counts.highlight++; });
  const list = liveList();

  main.innerHTML = `
    <div class="toolbar">
      <div class="search">${I.search}<input id="searchInp" placeholder="Titel oder Autor suchen…" value="${esc(state.search)}"></div>
      <button class="icon-btn" id="sortBtn" aria-label="Sortieren">${I.sort}</button>
      <button class="icon-btn" id="layoutBtn" aria-label="Ansicht wechseln">${state.layout === "list" ? I.grid : I.list}</button>
    </div>
    <div class="seg">${filters.map(([k, l]) =>
      `<button data-f="${k}" class="${state.filter === k ? "on" : ""}">${l}<span class="seg-count">${counts[k]}</span></button>`).join("")}</div>
    <div style="height:16px"></div>
    <div id="shelfWrap">${shelfHTML(list)}</div>`;

  const si = $("#searchInp");
  si.oninput = () => { state.search = si.value; $("#shelfWrap").innerHTML = shelfHTML(liveList()); bindCards(); };
  $("#sortBtn").onclick = openSortSheet;
  $("#layoutBtn").onclick = () => {
    state.layout = state.layout === "grid" ? "list" : "grid";
    localStorage.setItem("leselog_layout", state.layout);
    renderMain();
  };
  main.querySelectorAll(".seg button").forEach((b) =>
    b.onclick = () => { state.filter = b.dataset.f; renderMain(); });
  bindCards();
}

function shelfHTML(list) {
  if (!list.length) return emptyHTML();
  if (state.layout === "list") return `<div class="shelf-list">${list.map(rowHTML).join("")}</div>`;
  return `<div class="shelf">${list.map(bookCardHTML).join("")}</div>`;
}
function rowHTML(b) {
  const cov = coverImg(b);
  const st = b.status && b.status !== "read"
    ? `<span class="row-status ${b.status}">${statusLabel(b.status, b.media_type)}</span>` : "";
  return `<div class="row-book" data-id="${b.id}">
    <div class="cover-wrap thumb"><div class="cover-fallback"><div class="ft">${esc(b.title)}</div></div>${cov}</div>
    <div class="row-main">
      <div class="row-title">${esc(b.title)}</div>
      <div class="row-author">${esc(b.author || "Unbekannt")}</div>
      ${b.rating ? `<div class="b-stars">${stars(b.rating)}</div>` : ""}
    </div>
    ${st}
  </div>`;
}

function liveList() {
  let list = state.books.filter((b) => (b.media_type || "book") === state.mediaType);
  if (state.filter === "highlight") list = list.filter((b) => b.highlight);
  else if (state.filter !== "all") list = list.filter((b) => (b.status || "read") === state.filter);
  if (state.search) { const q = state.search.toLowerCase();
    list = list.filter((b) => (b.title + " " + (b.author || "")).toLowerCase().includes(q)); }
  return sortBooks(list);
}

function sortBooks(list) {
  const l = list.slice();
  const num = (x) => (x == null ? -Infinity : x);
  const readKey = (b) => b.date_finished || b.date_started || b.created_at || "";
  switch (state.sort) {
    case "read":   l.sort((a, b) => readKey(b).localeCompare(readKey(a))); break;
    case "title":  l.sort((a, b) => (a.title || "￿").localeCompare(b.title || "￿", "de", { sensitivity: "base" })); break;
    case "author": l.sort((a, b) => (a.author || "￿").localeCompare(b.author || "￿", "de", { sensitivity: "base" })); break;
    case "rating": l.sort((a, b) => num(b.rating) - num(a.rating)); break;
    case "pages":  l.sort((a, b) => num(b.page_count) - num(a.page_count)); break;
    // "added": Reihenfolge von state.books (created_at absteigend) beibehalten
  }
  return l;
}

function openSortSheet() {
  openSheet(`<h2>Sortieren</h2>
    <p class="sub">Wonach soll dein Regal geordnet sein?</p>
    <div class="sort-list">${SORTS.map(([k, l]) =>
      `<button class="sort-opt ${state.sort === k ? "on" : ""}" data-s="${k}"><span>${l}</span>${state.sort === k ? '<span class="sort-check">✓</span>' : ""}</button>`).join("")}</div>`);
  document.querySelectorAll(".sort-opt").forEach((b) => b.onclick = () => {
    state.sort = b.dataset.s;
    localStorage.setItem("leselog_sort", state.sort);
    closeSheet(); renderMain();
  });
}
function bindCards() {
  document.querySelectorAll(".book, .row-book").forEach((c) =>
    c.onclick = () => openDetail(state.books.find((b) => b.id === c.dataset.id)));
}
function bookCardHTML(b) {
  return `<div class="book" data-id="${b.id}">
    ${coverHTML(b)}
    <div class="b-title">${esc(b.title)}</div>
    <div class="b-author">${esc(b.author || "Unbekannt")}</div>
    ${b.rating ? `<div class="b-stars">${stars(b.rating)}</div>` : ""}
  </div>`;
}
function emptyHTML() {
  const ex = { book: "„Soloalbum von Stuckrad-Barre“", movie: "„Matrix“", series: "„Dark“" }[state.mediaType];
  const what = { book: "ein Buch", movie: "einen Film", series: "eine Serie" }[state.mediaType];
  return `<div class="empty">${I.book}
    <h2>Noch keine ${typeName()}</h2>
    <p>Tippe auf <b>+</b> und sprich einfach ${what} ein – ${ex} – den Rest suche ich für dich.</p>
  </div>`;
}

// ================================================================
//  Statistik
// ================================================================
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function yearSectionHTML(read) {
  const mt = state.mediaType, media = isMediaType(mt);
  const curYear = new Date().getFullYear();
  const yrs = read.map((b) => parseInt((b.date_finished || "").slice(0, 4))).filter((y) => y > 1900);
  const minYear = yrs.length ? Math.min(...yrs) : curYear;
  const yr = Math.min(curYear, Math.max(minYear, state.statsYear || curYear));

  const inYear = read.filter((b) => (b.date_finished || "").slice(0, 4) === String(yr));
  const months = Array(12).fill(0);
  inYear.forEach((b) => { const m = parseInt(b.date_finished.slice(5, 7)) - 1; if (m >= 0 && m < 12) months[m]++; });
  const maxM = Math.max(1, ...months);
  const yrMid = mt === "movie" ? Math.round(inYear.reduce((s, b) => s + (b.runtime || 0), 0) / 60)
    : mt === "series" ? inYear.reduce((s, b) => s + (b.total_episodes || 0), 0)
    : inYear.reduce((s, b) => s + (b.page_count || 0), 0);
  const yrMidLabel = mt === "movie" ? "Stunden" : mt === "series" ? "Folgen" : "Seiten";
  const yrRated = inYear.filter((b) => b.rating);
  const yrAvg = yrRated.length ? (yrRated.reduce((s, b) => s + b.rating, 0) / yrRated.length).toFixed(1) : "–";
  const best = months.indexOf(Math.max(...months));
  const one = { book: "Buch", movie: "Film", series: "Serie" }[mt];
  const title = mt === "movie" ? "Film-Jahr" : mt === "series" ? "Serien-Jahr" : "Lese-Jahr";
  const seen = media ? "gesehene" : "gelesene";

  return `
    <div class="section-title">${title}</div>
    <div class="year-card">
      <div class="year-head">
        <button class="yr-nav" id="yPrev" ${yr <= minYear ? "disabled" : ""}>‹</button>
        <div class="yr-title">${yr}</div>
        <button class="yr-nav" id="yNext" ${yr >= curYear ? "disabled" : ""}>›</button>
      </div>
      <div class="year-summary">
        <div><b>${inYear.length}</b><span>${inYear.length === 1 ? one : typeName()}</span></div>
        <div><b>${yrMid.toLocaleString("de-DE")}</b><span>${yrMidLabel}</span></div>
        <div><b>${yrAvg}</b><span>Ø ★</span></div>
      </div>
      ${inYear.length ? `<svg class="year-svg" viewBox="0 0 240 96" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${seen} ${typeName()} pro Monat">
        ${months.map((c, i) => {
          const bh = c ? Math.max(6, c / maxM * 58) : 3;
          const cx = i * 20 + 10, y = 74 - bh;
          return `<rect x="${(cx - 6).toFixed(1)}" y="${y.toFixed(1)}" width="12" height="${bh.toFixed(1)}" rx="2.5" fill="${c ? "var(--accent)" : "var(--line)"}"/>`
            + (c ? `<text x="${cx}" y="${(y - 3).toFixed(1)}" class="ysvg-val" text-anchor="middle">${c}</text>` : "")
            + `<text x="${cx}" y="92" class="ysvg-lab" text-anchor="middle">${MONTH_LETTERS[i]}</text>`;
        }).join("")}
      </svg>
      <div class="year-note">Stärkster Monat: <b>${MONTH_NAMES[best]}</b> (${months[best]})</div>`
      : `<div class="year-empty">In ${yr} noch keine ${seen} ${typeName()} mit Datum erfasst.</div>`}
    </div>`;
}

function renderStats(main) {
  const mt = state.mediaType, media = isMediaType(mt);
  const all = state.books.filter((b) => (b.media_type || "book") === mt);
  const read = all.filter((b) => (b.status || "read") === "read");
  const rated = read.filter((b) => b.rating);
  const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : "–";
  const people = new Set(read.map((b) => b.author).filter(Boolean));
  const reading = all.filter((b) => b.status === "reading").length;
  const want = all.filter((b) => b.status === "want").length;
  const top = [...read].filter((b) => b.rating >= 4).sort((a, b) => (b.rating - a.rating)).slice(0, 6);

  const midVal = mt === "movie" ? Math.round(read.reduce((s, b) => s + (b.runtime || 0), 0) / 60)
    : mt === "series" ? read.reduce((s, b) => s + (b.total_episodes || 0), 0)
    : read.reduce((s, b) => s + (b.page_count || 0), 0);
  const midLab = mt === "movie" ? "Stunden gesamt" : mt === "series" ? "Folgen gesamt" : "Seiten gesamt";
  const peopleLab = mt === "movie" ? "Regisseur:innen" : mt === "series" ? "Macher:innen" : "Autor:innen";
  const countLab = (media ? "gesehene " : "gelesene ") + typeName();

  main.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="num">${read.length}</div><div class="lab">${countLab}</div></div>
      <div class="stat-card"><div class="num">${midVal.toLocaleString("de-DE")}</div><div class="lab">${midLab}</div></div>
      <div class="stat-card"><div class="num">${people.size}</div><div class="lab">verschiedene ${peopleLab}</div></div>
      <div class="stat-card"><div class="num">${avg}</div><div class="lab">Ø Bewertung</div></div>
    </div>
    ${(reading || want) ? `<div class="mini-counts">${reading ? `<span>📖 ${reading} ${media ? "schaue ich gerade" : "lese ich gerade"}</span>` : ""}${want ? `<span>🔖 ${want} auf der ${media ? "Will-sehen" : "Will-lesen"}-Liste</span>` : ""}</div>` : ""}

    ${yearSectionHTML(read)}

    ${top.length ? `<div class="section-title">Deine Favoriten</div>
      <div class="shelf">${top.map(bookCardHTML).join("")}</div>` : ""}

    <div class="section-title">Deine Daten</div>
    <p style="color:var(--ink-soft);font-size:13.5px;margin:-6px 0 12px">Deine Bücher gehören dir. Exportiere sie jederzeit oder hol dir eine Liste aus einer anderen App rein.</p>
    <button class="btn block" id="enrichBtn" style="margin-bottom:10px">✨ Cover &amp; Infos nachladen</button>
    <div class="data-actions">
      <button class="btn" id="expCsv">CSV exportieren</button>
      <button class="btn" id="expJson">Backup (JSON)</button>
      <button class="btn" id="impBtn">Importieren</button>
    </div>
    <input type="file" id="impFile" accept=".csv,.json,text/csv,application/json" class="hidden">

    <div style="height:24px"></div>
    <button class="btn ghost block" id="logoutBtn" style="color:var(--ink-soft)">Abmelden</button>`;
  bindCards();
  const curYear = new Date().getFullYear();
  if ($("#yPrev")) $("#yPrev").onclick = () => { state.statsYear = (state.statsYear || curYear) - 1; renderMain(); };
  if ($("#yNext")) $("#yNext").onclick = () => { state.statsYear = (state.statsYear || curYear) + 1; renderMain(); };
  $("#expCsv").onclick = () => {
    if (!state.books.length) return toast("Noch keine Bücher zum Exportieren");
    download("leselog-buecher.csv", booksToCSV(state.books), "text/csv");
    toast(state.books.length + " Bücher als CSV exportiert");
  };
  $("#expJson").onclick = () => {
    if (!state.books.length) return toast("Noch keine Bücher zum Sichern");
    download("leselog-backup.json", booksToJSON(state.books), "application/json");
    toast("Backup gespeichert");
  };
  $("#impBtn").onclick = () => $("#impFile").click();
  $("#impFile").onchange = (e) => { if (e.target.files[0]) runImport(e.target.files[0]); };
  $("#enrichBtn").onclick = async () => {
    const btn = $("#enrichBtn"); btn.disabled = true; btn.textContent = "Lädt …";
    await enrichMissingCovers();
    if ($("#enrichBtn")) { $("#enrichBtn").disabled = false; $("#enrichBtn").innerHTML = "✨ Cover &amp; Infos nachladen"; }
  };
  $("#logoutBtn").onclick = async () => { await signOut(); };
}

// ================================================================
//  Bücher laden
// ================================================================
async function loadBooks() {
  const main = $("#main");
  if (DEMO) { state.books = DEMO_BOOKS.slice(); renderMain(); return; }
  if (main) main.innerHTML = `<div class="center-load"><span class="spin dark"></span>Regal wird geladen …</div>`;
  try {
    state.books = await fetchBooks();
    renderMain();
    autoEnrich();
  } catch (e) { toast("Konnte Bücher nicht laden"); console.error(e); }
}

// Importierte Bücher automatisch über Google Books vervollständigen
// (Cover, ISBN, Seiten, Jahr, Verlag, Klappentext, Web-Bewertung).
function titleWords(s) {
  return new Set(String(s || "").toLowerCase().split(/[:–\-]/)[0]
    .replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}
function pickHit(b, results) {
  const qw = titleWords(b.title);
  const scored = results.map((h) => {
    const hw = titleWords(h.title);
    const ov = qw.size ? [...qw].filter((w) => hw.has(w)).length / qw.size : (h.title ? 1 : 0);
    return { h, score: ov + (h.cover_url ? 0.3 : 0), ov };
  }).filter((x) => x.ov >= 0.34);
  scored.sort((a, b2) => b2.score - a.score);
  return scored.length ? scored[0].h : null;
}
async function enrichOne(b) {
  const patch = {};
  try {
    const q = [b.title, (b.author || "").split(",")[0]].filter(Boolean).join(" ");
    let hit = pickHit(b, await searchBooks(q));
    if (!hit) hit = pickHit(b, await searchBooks(b.title)); // 2. Versuch: nur Titel
    if (hit) {
      if (hit.cover_url) patch.cover_url = hit.cover_url;
      if (hit.isbn13) patch.isbn13 = hit.isbn13;
      if (hit.isbn10) patch.isbn10 = hit.isbn10;
      if (hit.page_count) patch.page_count = hit.page_count;
      if (hit.published_year) patch.published_year = hit.published_year;
      if (hit.publisher) patch.publisher = hit.publisher;
      if (hit.description) patch.description = hit.description;
      if (hit.web_rating != null) { patch.web_rating = hit.web_rating; patch.web_rating_count = hit.web_rating_count; }
      if (hit.google_books_id) patch.google_books_id = hit.google_books_id;
    }
  } catch (_) {}
  return patch;
}
async function enrichList(list, label) {
  let done = 0, filled = 0;
  for (const b of list) {
    const patch = await enrichOne(b);
    patch.enriched = true;
    if (patch.cover_url) filled++;
    try {
      const saved = await updateBook(b.id, patch);
      const i = state.books.findIndex((x) => x.id === b.id);
      if (i > -1) state.books[i] = saved;
    } catch (_) {}
    if (++done % 4 === 0) { renderMain(); if (label) toast(`${label} ${done}/${list.length} …`); }
    await new Promise((r) => setTimeout(r, 140));
  }
  renderMain();
  return filled;
}
// Läuft automatisch beim Laden: alle noch nicht angereicherten Import-Bücher
async function autoEnrich() {
  if (DEMO) return;
  const todo = state.books.filter((b) => !b.enriched && b.source === "import" && (b.media_type || "book") === "book");
  if (todo.length) await enrichList(todo, "Vervollständige");
}
// Manuell: gezielt Bücher ohne Cover erneut versuchen
async function enrichMissingCovers() {
  if (DEMO) return toast("Nur mit echten Büchern");
  const todo = state.books.filter((b) => !b.cover_url && (b.media_type || "book") === "book");
  if (!todo.length) return toast("Alle Bücher haben schon ein Cover 👍");
  toast(`Lade Infos für ${todo.length} Bücher …`);
  const filled = await enrichList(todo, "Cover");
  toast(filled ? `${filled} Cover ergänzt ✨` : "Keine weiteren Cover gefunden");
}

// ================================================================
//  Hinzufügen – Auswahl
// ================================================================
function runFor(parsed) { return isMediaType(state.mediaType) ? runMediaSearch(parsed) : runSearch(parsed); }

function openAdd() {
  const media = isMediaType(state.mediaType);
  const one = { book: "Buch", movie: "Film", series: "Serie" }[state.mediaType];
  const micLabel = media ? one + " einsprechen" : "Buch einsprechen";
  openSheet(`
    <h2>${one} hinzufügen</h2>
    <p class="sub">${media ? "Sprich einfach los oder tipp den Titel." : "Sprich einfach los, tipp den Titel, scanne den Barcode oder lade eine EPUB."}</p>
    <button class="mic-btn" id="micBtn">${I.mic}<span>${micLabel}</span></button>
    <div class="rec-status" id="recStatus"></div>
    <div class="or-div">oder</div>
    <div class="field-row">
      <div class="search">${I.search}<input id="titleInp" placeholder="Titel eingeben…" enterkeyhint="search"></div>
      <button class="btn primary" id="titleGo">Suchen</button>
    </div>
    ${media ? "" : `<div class="secondary-row">
      <button class="btn" id="scanBtn">${I.scan} Barcode</button>
      <button class="btn" id="epubBtn">${I.epub} EPUB</button>
    </div>
    <input type="file" id="epubFile" accept=".epub" class="hidden">`}
  `);
  const doTyped = () => {
    const v = $("#titleInp").value.trim();
    if (!v) return;
    const parsed = parseUtterance(v);
    parsed.source = "manual";
    runFor(parsed);
  };
  $("#micBtn").onclick = onMic;
  $("#titleGo").onclick = doTyped;
  $("#titleInp").addEventListener("keydown", (e) => { if (e.key === "Enter") doTyped(); });
  if (!media) {
    $("#scanBtn").onclick = openScanner;
    $("#epubBtn").onclick = () => $("#epubFile").click();
    $("#epubFile").onchange = (e) => { if (e.target.files[0]) onEpub(e.target.files[0]); };
  }
}

// ---------------- Mikrofon ----------------
let activeDictation = null;
let recTimerInt = null;
async function onMic() {
  const btn = $("#micBtn");
  const status = $("#recStatus");
  if (activeDictation) {  // -> stoppen & transkribieren
    btn.classList.remove("recording");
    clearInterval(recTimerInt);
    status.innerHTML = `<span class="spin dark"></span> wird verstanden …`;
    try {
      const text = await activeDictation.stop();
      activeDictation = null;
      if (!text) { status.textContent = "Nichts verstanden – bitte nochmal."; resetMic(); return; }
      const parsed = parseUtterance(text);
      parsed.source = "voice";
      runFor(parsed);
    } catch (e) { toast(e.message || "Transkription fehlgeschlagen"); activeDictation = null; resetMic(); }
    return;
  }
  try {
    let secs = 0;
    activeDictation = await startDictation({
      onStatus: (s) => { if (s === "recording") {
        btn.classList.add("recording");
        btn.querySelector("span").textContent = "Fertig – tippen zum Stoppen";
        recTimerInt = setInterval(() => { secs++; status.innerHTML =
          `<span class="rec-timer">${String(Math.floor(secs/60)).padStart(2,"0")}:${String(secs%60).padStart(2,"0")}</span> – ich höre zu…`; }, 1000);
      }},
      onPartial: (t) => { if (t) status.textContent = "„" + t + "“"; },
    });
  } catch (e) { toast(e.message || "Mikrofon nicht verfügbar"); resetMic(); }
}
function resetMic() {
  const btn = $("#micBtn");
  const one = { book: "Buch", movie: "Film", series: "Serie" }[state.mediaType];
  if (btn) { btn.classList.remove("recording"); btn.querySelector("span").textContent = one + " einsprechen"; }
  clearInterval(recTimerInt);
}

// ================================================================
//  Suche & Kandidaten
// ================================================================
async function runSearch(parsed) {
  const query = (parsed.query || "").trim();
  const rawInput = parsed.rawInput || null;
  const status = parsed.status || "read";
  const source = parsed.source || (rawInput ? "voice" : "manual");
  if (!query) return;
  openSheet(`<h2>Ich suche …</h2><div class="center-load"><span class="spin dark"></span>
    „${esc(query)}“ wird nachgeschlagen</div>`);
  try {
    const results = await searchBooks(query);
    if (!results.length) {
      const base = { title: query, raw_input: rawInput, status, source };
      openSheet(`<h2>Nichts gefunden</h2>
        <p class="sub">Zu „${esc(query)}“ habe ich nichts gefunden. Trag es von Hand ein:</p>
        ${bookFormHTML(base, true)}`);
      bindForm(base, true);
      return;
    }
    showCandidates(results, { rawInput, status, source, query });
  } catch (e) { toast(e.message || "Suche fehlgeschlagen"); console.error(e); }
}

async function runMediaSearch(parsed) {
  const query = (parsed.query || "").trim();
  const rawInput = parsed.rawInput || null;
  const status = parsed.status || "read";
  const source = parsed.source || (rawInput ? "voice" : "manual");
  if (!query) return;
  openSheet(`<h2>Ich suche …</h2><div class="center-load"><span class="spin dark"></span>
    „${esc(query)}“ wird nachgeschlagen</div>`);
  try {
    const results = await searchMedia(query, state.mediaType);
    if (!results.length) {
      const base = { title: query, raw_input: rawInput, status, source, media_type: state.mediaType };
      openSheet(`<h2>Nichts gefunden</h2>
        <p class="sub">Zu „${esc(query)}“ habe ich nichts gefunden. Trag es von Hand ein:</p>
        ${bookFormHTML(base, true)}`);
      bindForm(base, true);
      return;
    }
    showCandidates(results, { rawInput, status, source, query });
  } catch (e) { toast(e.message || "Suche fehlgeschlagen"); console.error(e); }
}

function showCandidates(results, parsed) {
  const { rawInput, status = "read", source = "manual" } = parsed;
  const heading = { book: "Welches Buch ist es?", movie: "Welcher Film ist es?", series: "Welche Serie ist es?" }[state.mediaType];
  const intentNote = status !== "read"
    ? ` <span style="color:var(--accent);font-weight:600">→ ${statusLabel(status)}</span>` : "";
  openSheet(`
    <h2>${heading}</h2>
    <p class="sub">${rawInput ? "„" + esc(rawInput) + "“" : "Dein Treffer"}${intentNote} – tippe das richtige an.</p>
    <div id="cands">${results.map((b, i) => `
      <div class="cand" data-i="${i}">
        ${b.cover_url ? `<img class="mini" src="${esc(b.cover_url)}" onerror="this.style.visibility='hidden'">`
          : `<div class="mini"></div>`}
        <div class="c-main">
          <div class="c-title">${esc(b.title)}</div>
          <div class="c-meta">${esc(b.author || "Unbekannt")}${b.published_year ? " · " + b.published_year : ""}${b.page_count ? " · " + b.page_count + " S." : ""}</div>
        </div>
        <span class="c-pick">${I.chevron}</span>
      </div>`).join("")}
    </div>
    <button class="btn ghost block" id="noneBtn" style="margin-top:6px;color:var(--ink-soft)">Keins davon – selbst eintragen</button>
  `);
  document.querySelectorAll(".cand").forEach((c) =>
    c.onclick = () => {
      const b = { ...results[c.dataset.i], status, source };
      if (rawInput) { b.raw_input = rawInput; if (status === "read") b.reading_days = guessReadingDays(rawInput); }
      openReview(b);
    });
  $("#noneBtn").onclick = () => {
    openReview({ title: parsed.query || rawInput || "", raw_input: rawInput, status, source, media_type: state.mediaType });
  };
}

// ================================================================
//  Review / Formular (neu ODER bearbeiten)
// ================================================================
const STATUS_KEYS = ["read", "reading", "want", "dropped"];

function bookFormHTML(b, isNew) {
  b = b || {};
  const mt = b.media_type || "book";
  const media = isMediaType(mt);
  const missingWhen = (b.status || "read") === "read" && !b.date_finished;
  const authorLabel = mt === "movie" ? "Regie" : mt === "series" ? "Macher:in" : "Autor:in";

  const facts = mt === "series"
    ? `${b.total_seasons ? b.total_seasons + " Staffeln" : ""}${b.total_episodes ? " · " + b.total_episodes + " Folgen" : ""}`
    : mt === "movie"
    ? `${b.runtime ? b.runtime + " Min." : ""}`
    : `${b.page_count ? b.page_count + " Seiten<br>" : ""}${b.publisher ? esc(b.publisher) + "<br>" : ""}${b.isbn13 ? "ISBN " + esc(b.isbn13) : ""}`;

  const links = media
    ? (b.tmdb_id ? `<div class="store-links"><a href="${esc(tmdbUrl(b))}" target="_blank" rel="noopener">Auf TMDb ansehen ↗</a></div>` : "")
    : (b.title ? `<div class="store-links" id="storeLinks">${storeLinksHTML(b)}</div>` : "");

  const midFields = mt === "series"
    ? `<div class="two-col">
         <label class="fld"><span class="lbl">Staffel</span>
           <input class="input" id="f_season" type="number" inputmode="numeric" value="${b.season || ""}" placeholder="1"></label>
         <label class="fld"><span class="lbl">Folge</span>
           <input class="input" id="f_episode" type="number" inputmode="numeric" value="${b.episode || ""}" placeholder="1"></label>
       </div>
       ${(b.total_seasons || b.total_episodes) ? `<div class="progress-hint">Insgesamt ${b.total_seasons || "?"} Staffeln${b.total_episodes ? " · " + b.total_episodes + " Folgen" : ""}</div>` : ""}
       <label class="fld"><span class="lbl">Jahr</span>
         <input class="input" id="f_year" type="number" inputmode="numeric" value="${b.published_year || ""}"></label>`
    : mt === "movie"
    ? `<div class="two-col">
         <label class="fld"><span class="lbl">Laufzeit (Min.)</span>
           <input class="input" id="f_runtime" type="number" inputmode="numeric" value="${b.runtime || ""}"></label>
         <label class="fld"><span class="lbl">Jahr</span>
           <input class="input" id="f_year" type="number" inputmode="numeric" value="${b.published_year || ""}"></label>
       </div>`
    : `<div class="two-col">
         <label class="fld"><span class="lbl">Seiten</span>
           <input class="input" id="f_pages" type="number" inputmode="numeric" value="${b.page_count || ""}"></label>
         <label class="fld"><span class="lbl">Jahr</span>
           <input class="input" id="f_year" type="number" inputmode="numeric" value="${b.published_year || ""}"></label>
       </div>
       <label class="fld"><span class="lbl">Verlag</span>
         <input class="input" id="f_pub" value="${esc(b.publisher || "")}"></label>`;

  return `
    <div class="detail-hero">
      ${coverHTML(b, "").replace('class="cover-wrap ', 'style="width:112px" class="cover-wrap ')}
      <div class="dh-main">
        <div class="stars-row">
          <div class="stars-input" id="stars">${[1,2,3,4,5].map((n) =>
            `<span class="s ${b.rating >= n ? "on" : ""}" data-n="${n}">★</span>`).join("")}</div>
          <button type="button" class="hl-toggle ${b.highlight ? "on" : ""}" id="hlToggle" title="Als Highlight markieren">★ Highlight</button>
        </div>
        <div class="dh-facts">${facts}</div>
        <div class="web-rating" id="webRating">${webRatingHTML(b)}</div>
      </div>
    </div>
    ${links}
    <div id="klappentext">${klappentextHTML(b)}</div>

    <div class="status-pick" id="statusPick">
      ${STATUS_KEYS.map((k) => `<button data-s="${k}" class="${(b.status || "read") === k ? "on" : ""}">${statusLabel(k, mt)}</button>`).join("")}
    </div>

    <label class="fld abandon-fld" id="abandonFld" style="${(b.status === "dropped") ? "" : "display:none"}">
      <span class="lbl">Warum abgebrochen?</span>
      <textarea class="input" id="f_abandon" placeholder="z. B. zäh geworden, Thema doch nichts für mich …">${esc(b.abandon_reason || "")}</textarea></label>

    <label class="fld"><span class="lbl">Titel</span>
      <input class="input" id="f_title" value="${esc(b.title)}"></label>
    <label class="fld"><span class="lbl">${authorLabel}</span>
      <input class="input" id="f_author" value="${esc(b.author || "")}" placeholder="wird gesucht…"></label>

    ${midFields}

    <div class="two-col">
      <label class="fld"><span class="lbl">Angefangen</span>
        <input class="input" id="f_start" type="date" value="${b.date_started || ""}"></label>
      <label class="fld"><span class="lbl">${media ? "Gesehen am" : "Beendet"}</span>
        <input class="input" id="f_finish" type="date" value="${b.date_finished || ""}"></label>
    </div>
    <label class="check-line"><input type="checkbox" id="f_startunknown" ${b.date_started ? "" : (b.date_finished ? "checked" : "")}>
      <span>Startdatum unbekannt (nur Ende bekannt)</span></label>
    <label class="fld"><span class="lbl">Notizen / Gedanken</span>
      <textarea class="input" id="f_notes" placeholder="Was ist dir geblieben?">${esc(b.notes || "")}</textarea></label>
    <input type="hidden" id="f_isbn" value="${esc(b.isbn13 || "")}">

    ${missingWhen && !media ? `<div class="hint">${I.info}<span>Magst du noch ergänzen, <b>wann</b> du es gelesen hast und <b>wie lange</b> du gebraucht hast? (optional)</span></div>` : ""}

    <div class="sheet-actions">
      ${isNew ? "" : `<button class="btn danger" id="delBtn">Löschen</button>`}
      <button class="btn primary" id="saveBtn">${isNew ? "Ins Regal stellen" : "Speichern"}</button>
    </div>`;
}

async function getExtras(b) {
  if (isMediaType(b.media_type)) return b.tmdb_id ? await getMediaDetails(b.tmdb_id, b.media_type) : {};
  return await fetchExtras(b);
}
async function openReview(b) {
  // Klappentext/Bewertung/Staffeln ergänzen, BEVOR gerendert wird (damit es beim Speichern mitkommt)
  const ex = await getExtras(b);
  Object.assign(b, ex);
  openSheet(bookFormHTML(b, true));
  bindForm(b, true);
}
async function openDetail(b) {
  openSheet(bookFormHTML(b, false));   // vorhandenes Buch sofort zeigen
  bindForm(b, false);
  const ex = await getExtras(b);        // fehlende Infos im Hintergrund nachtragen
  if (ex && (ex.description || ex.web_rating != null)) {
    Object.assign(b, ex);
    const wr = $("#webRating"); if (wr) wr.innerHTML = webRatingHTML(b);
    const kt = $("#klappentext"); if (kt) { kt.innerHTML = klappentextHTML(b); bindKlappentext(); }
  }
}
function bindKlappentext() {
  const t = document.querySelector(".kt-text");
  if (t) t.onclick = () => t.classList.toggle("clamp");
}

function bindForm(b, isNew) {
  const draft = { ...b };
  draft.status = draft.status || "read";
  draft.rating = draft.rating || 0;
  draft.highlight = !!draft.highlight;
  bindKlappentext();

  // Sterne
  const paint = () => document.querySelectorAll("#stars .s").forEach((s) =>
    s.classList.toggle("on", draft.rating >= +s.dataset.n));
  document.querySelectorAll("#stars .s").forEach((s) =>
    s.onclick = () => { draft.rating = (draft.rating === +s.dataset.n) ? 0 : +s.dataset.n; paint(); });

  // Highlight-Schalter
  const hlBtn = $("#hlToggle");
  if (hlBtn) hlBtn.onclick = () => { draft.highlight = !draft.highlight; hlBtn.classList.toggle("on", draft.highlight); };

  // Status (blendet bei „Abgebrochen“ das Grund-Feld ein)
  const abandonFld = $("#abandonFld");
  document.querySelectorAll("#statusPick button").forEach((btn) =>
    btn.onclick = () => { draft.status = btn.dataset.s;
      document.querySelectorAll("#statusPick button").forEach((x) => x.classList.toggle("on", x === btn));
      if (abandonFld) abandonFld.style.display = (draft.status === "dropped") ? "" : "none"; });

  // Startdatum unbekannt: Feld sperren/leeren
  const startInp = $("#f_start");
  const startUnknown = $("#f_startunknown");
  const applyStartUnknown = () => {
    if (!startInp || !startUnknown) return;
    startInp.disabled = startUnknown.checked;
    startInp.style.opacity = startUnknown.checked ? "0.45" : "";
    if (startUnknown.checked) startInp.value = "";
  };
  if (startUnknown) { startUnknown.onchange = applyStartUnknown; applyStartUnknown(); }

  const saveBtn = $("#saveBtn");
  const mt = draft.media_type || "book";
  const val = (id) => { const e = $("#" + id); return e ? e.value : ""; };
  const int = (id) => parseInt(val(id)) || null;
  saveBtn.onclick = async () => {
    const startUnknown = $("#f_startunknown");
    const rec = {
      title: val("f_title").trim(),
      author: val("f_author").trim() || null,
      published_year: int("f_year"),
      date_started: (startUnknown && startUnknown.checked) ? null : (val("f_start") || null),
      date_finished: val("f_finish") || null,
      notes: val("f_notes").trim() || null,
      status: draft.status,
      rating: draft.rating || null,
      highlight: !!draft.highlight,
      abandon_reason: draft.status === "dropped" ? (val("f_abandon").trim() || null) : null,
      media_type: mt,
    };
    if (mt === "series") {
      rec.season = int("f_season"); rec.episode = int("f_episode");
      rec.total_seasons = draft.total_seasons || null; rec.total_episodes = draft.total_episodes || null;
      rec.tmdb_id = draft.tmdb_id || null;
    } else if (mt === "movie") {
      rec.runtime = int("f_runtime"); rec.tmdb_id = draft.tmdb_id || null;
    } else {
      rec.page_count = int("f_pages");
      rec.publisher = val("f_pub").trim() || null;
      rec.isbn13 = val("f_isbn") || draft.isbn13 || null;
    }
    if (!rec.title) return toast("Titel fehlt");
    saveBtn.innerHTML = '<span class="spin"></span>'; saveBtn.disabled = true;
    if (DEMO) {
      if (isNew) { state.books.unshift({ ...draft, ...rec, id: "d" + Date.now() }); toast("(Demo) hinzugefügt"); }
      else { const i = state.books.findIndex((x) => x.id === b.id); if (i > -1) state.books[i] = { ...b, ...rec }; toast("(Demo) gespeichert"); }
      closeSheet(); renderMain(); return;
    }
    try {
      if (isNew) {
        const full = { ...draft, ...rec };
        delete full.id; delete full.created_at; delete full.updated_at; delete full.user_id;
        const saved = await insertBook(full);
        state.books.unshift(saved);
        toast("„" + saved.title + "“ ins Regal gestellt 📚");
      } else {
        const saved = await updateBook(b.id, rec);
        const idx = state.books.findIndex((x) => x.id === b.id);
        if (idx > -1) state.books[idx] = saved;
        toast("Gespeichert");
      }
      closeSheet();
      renderMain();
    } catch (e) { toast(e.message || "Speichern fehlgeschlagen"); saveBtn.innerHTML = "Speichern"; saveBtn.disabled = false; console.error(e); }
  };

  if (!isNew) $("#delBtn").onclick = async () => {
    if (!confirm("„" + b.title + "“ wirklich aus dem Regal nehmen?")) return;
    if (DEMO) { state.books = state.books.filter((x) => x.id !== b.id); closeSheet(); renderMain(); toast("(Demo) entfernt"); return; }
    try { await removeBook(b.id); state.books = state.books.filter((x) => x.id !== b.id);
      closeSheet(); renderMain(); toast("Entfernt"); }
    catch (e) { toast("Löschen fehlgeschlagen"); }
  };

  // Wenn Autor noch fehlt: im Hintergrund nachschlagen (nur Bücher)
  if (isNew && mt === "book" && !draft.author && draft.title) {
    searchBooks(draft.title).then((r) => {
      if (r[0] && $("#f_author") && !$("#f_author").value) {
        const g = r[0];
        if (g.author) $("#f_author").value = g.author;
        if (g.page_count && $("#f_pages") && !$("#f_pages").value) $("#f_pages").value = g.page_count;
        if (g.published_year && $("#f_year") && !$("#f_year").value) $("#f_year").value = g.published_year;
        if (g.publisher && $("#f_pub") && !$("#f_pub").value) $("#f_pub").value = g.publisher;
        if (g.isbn13 && $("#f_isbn")) $("#f_isbn").value = g.isbn13;
      }
    }).catch(() => {});
  }
}

// ================================================================
//  Barcode-Scanner
// ================================================================
let activeScanner = null;
async function openScanner() {
  openSheet(`
    <h2>Barcode scannen</h2>
    <p class="sub">Halte den Strichcode auf der Buchrückseite vor die Kamera.</p>
    <div style="position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:4/3">
      <video id="scanVid" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;inset:18% 10%;border:2px solid rgba(255,255,255,.8);border-radius:12px"></div>
    </div>
    <div class="rec-status" id="scanStatus">Kamera startet…</div>
  `);
  try {
    activeScanner = await startScanner($("#scanVid"), {
      onDetected: async (isbn) => {
        activeScanner && activeScanner.stop(); activeScanner = null;
        $("#scanStatus").innerHTML = `<span class="spin dark"></span> ISBN ${esc(isbn)} – suche Buch…`;
        try {
          const b = await searchByISBN(isbn);
          if (b) { b.source = "barcode"; openReview(b); }
          else openReview({ title: "", isbn13: isbn.length === 13 ? isbn : null, source: "barcode" });
        } catch (e) { toast("Buch zur ISBN nicht gefunden"); }
      },
      onError: () => { $("#scanStatus").textContent = "Kamera nicht verfügbar – tipp den Titel stattdessen ein."; },
    });
    setTimeout(() => { const s = $("#scanStatus"); if (s && s.textContent === "Kamera startet…") s.textContent = "Suche Barcode…"; }, 1200);
  } catch (e) { toast("Scanner nicht verfügbar"); }
}

// ================================================================
//  EPUB
// ================================================================
async function onEpub(file) {
  openSheet(`<h2>EPUB wird gelesen …</h2><div class="center-load"><span class="spin dark"></span>${esc(file.name)}</div>`);
  try {
    const meta = await readEpubMeta(file);
    let enriched = { ...meta };
    // Cover & Rest per ISBN/Titel nachladen
    try {
      const g = meta.isbn13 ? await searchByISBN(meta.isbn13)
                            : (await searchBooks(meta.title + " " + (meta.author || "")))[0];
      if (g) enriched = { ...g, ...meta, cover_url: g.cover_url, description: g.description, source: "epub" };
    } catch (_) {}
    openReview(enriched);
  } catch (e) { toast("EPUB konnte nicht gelesen werden"); console.error(e); openAdd(); }
}

// ================================================================
//  Import
// ================================================================
function bookKey(b) {
  return b.isbn13 ? "i:" + b.isbn13
    : ("t:" + (b.title || "").toLowerCase().trim() + "|" + (b.author || "").toLowerCase().trim());
}

async function runImport(file) {
  openSheet(`<h2>Datei wird gelesen …</h2><div class="center-load"><span class="spin dark"></span>${esc(file.name)}</div>`);
  let parsed;
  try { parsed = await parseImportFile(file); }
  catch (e) { toast("Datei konnte nicht gelesen werden"); console.error(e); openAdd(); return; }

  if (!parsed.length) {
    openSheet(`<h2>Nichts gefunden</h2><p class="sub">In „${esc(file.name)}" konnte ich keine Bücher erkennen. Unterstützt werden CSV (auch von Goodreads) und JSON.</p>
      <button class="btn block" id="closeImp">Okay</button>`);
    $("#closeImp").onclick = closeSheet; return;
  }

  // Duplikate gegen vorhandenes Regal aussortieren
  const existing = new Set(state.books.map(bookKey));
  const fresh = parsed.filter((b) => !existing.has(bookKey(b)));
  const dupes = parsed.length - fresh.length;

  const preview = fresh.slice(0, 5).map((b) =>
    `<div class="cand"><div class="mini" style="width:34px;height:50px"></div>
      <div class="c-main"><div class="c-title">${esc(b.title)}</div>
      <div class="c-meta">${esc(b.author || "Unbekannt")}${b.status !== "read" ? " · " + statusLabel(b.status, b.media_type) : ""}</div></div></div>`).join("");

  openSheet(`
    <h2>${fresh.length} ${fresh.length === 1 ? "Buch" : "Bücher"} gefunden</h2>
    <p class="sub">${dupes ? dupes + " Dubletten überspringe ich. " : ""}Sollen diese in dein Regal?</p>
    ${preview}
    ${fresh.length > 5 ? `<p class="sub" style="text-align:center">… und ${fresh.length - 5} weitere</p>` : ""}
    <div class="sheet-actions">
      <button class="btn ghost" id="cancelImp">Abbrechen</button>
      <button class="btn primary" id="doImp">${fresh.length} importieren</button>
    </div>`);
  $("#cancelImp").onclick = closeSheet;
  if (!fresh.length) { $("#doImp").textContent = "Nichts Neues"; $("#doImp").disabled = true; return; }

  $("#doImp").onclick = async () => {
    const btn = $("#doImp"); btn.innerHTML = '<span class="spin"></span>'; btn.disabled = true;
    try {
      let saved = [];
      if (DEMO) {
        saved = fresh.map((b, i) => ({ ...b, id: "imp" + Date.now() + i }));
      } else {
        for (let i = 0; i < fresh.length; i += 200) {
          const chunk = fresh.slice(i, i + 200).map((b) => {
            const c = { ...b }; delete c.id; delete c.user_id; delete c.created_at; delete c.updated_at; return c;
          });
          saved = saved.concat(await insertBooks(chunk));
        }
      }
      state.books = saved.concat(state.books);
      closeSheet(); renderMain();
      toast(saved.length + " Bücher importiert 📚");
    } catch (e) { toast(e.message || "Import fehlgeschlagen"); btn.innerHTML = "Nochmal"; btn.disabled = false; console.error(e); }
  };
}

// ================================================================
//  Boot
// ================================================================
$("#sheet-scrim").onclick = closeSheet;

onAuth((session) => {
  if (DEMO) return;
  const was = !!state.session;
  state.session = session;
  if (!!session !== was) renderScreen();
});

(async () => {
  if (DEMO) { state.session = { demo: true }; await renderScreen(); return; }
  state.session = await currentSession();
  await renderScreen();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
