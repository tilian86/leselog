// Leselog – App-Steuerung
import { CONFIG } from "./config.js";
import { currentSession, onAuth, signInPassword, signUpPassword, signOut,
         fetchBooks, insertBook, insertBooks, updateBook, removeBook } from "./supa.js";
import { searchBooks, searchByISBN, guessReadingDays, parseUtterance, amazonUrl } from "./enrich.js";
import { startDictation, hasMic } from "./audio.js";
import { startScanner } from "./scan.js";
import { readEpubMeta } from "./epub.js";
import { booksToCSV, booksToJSON, download, parseImportFile } from "./io.js";

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
};

// ---------------- State ----------------
const state = { session: null, books: [], filter: "all", search: "", view: "shelf" };

// Vorschau-Modus (index.html#demo): Design ohne Login/DB ansehen. In Produktion unsichtbar.
const DEMO = location.hash.includes("demo");
const DEMO_BOOKS = [
  { id: "d1", title: "Soloalbum", author: "Benjamin von Stuckrad-Barre", page_count: 240, published_year: 1998, publisher: "Kiepenheuer & Witsch", status: "read", rating: 4, cover_url: null, isbn13: "9783462027004" },
  { id: "d2", title: "Tschick", author: "Wolfgang Herrndorf", page_count: 248, published_year: 2010, publisher: "Rowohlt", status: "read", rating: 5, cover_url: "https://covers.openlibrary.org/b/id/8418261-L.jpg" },
  { id: "d3", title: "Die Vermessung der Welt", author: "Daniel Kehlmann", page_count: 272, published_year: 2005, publisher: "Rowohlt", status: "reading", rating: 0, cover_url: "https://covers.openlibrary.org/b/id/1165201-L.jpg" },
  { id: "d4", title: "Der Steppenwolf", author: "Hermann Hesse", page_count: 224, published_year: 1927, publisher: "S. Fischer", status: "read", rating: 5, cover_url: "https://covers.openlibrary.org/b/id/3221083-L.jpg" },
  { id: "d5", title: "Nachts ist es leiser in Teheran", author: "Shida Bazyar", page_count: 288, published_year: 2016, status: "want", rating: 0, cover_url: null },
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
function coverHTML(b, cls = "") {
  const status = b.status && b.status !== "read"
    ? `<span class="badge-status ${b.status}">${b.status === "reading" ? "Lese gerade" : "Will lesen"}</span>` : "";
  // Fallback (Titel/Autor auf Buchrücken) liegt immer darunter; das Bild deckt es ab,
  // solange es lädt. Schlägt es fehl, wird das <img> entfernt und der Fallback erscheint.
  const fallback = `<div class="cover-fallback"><div class="ft">${esc(b.title)}</div><div class="fa">${esc(b.author || "")}</div></div>`;
  const img = b.cover_url
    ? `<img src="${esc(b.cover_url)}" alt="" loading="lazy" onerror="this.remove()">`
    : "";
  return `<div class="cover-wrap ${cls}">${status}${fallback}${img}</div>`;
}
function stars(n) { return n ? "★".repeat(n) + "☆".repeat(5 - n) : ""; }

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
    <div class="topbar"><div class="app">
      <div class="brand"><span class="mark">${I.book}</span><h1>Leselog</h1></div>
      <span class="count-pill" id="countPill"></span>
    </div></div>
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
  await loadBooks();
}

function renderMain() {
  const main = $("#main");
  if (!main) return;
  $("#countPill").textContent =
    state.books.length + (state.books.length === 1 ? " Buch" : " Bücher");
  document.querySelectorAll(".dock .tab").forEach((t) =>
    t.classList.toggle("on", t.dataset.view === state.view));

  if (state.view === "stats") return renderStats(main);

  const filters = [["all", "Alle"], ["read", "Gelesen"], ["reading", "Lese gerade"], ["want", "Will lesen"]];
  let list = state.books.slice();
  if (state.filter !== "all") list = list.filter((b) => (b.status || "read") === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter((b) => (b.title + " " + (b.author || "")).toLowerCase().includes(q));
  }

  main.innerHTML = `
    <div class="toolbar">
      <div class="search">${I.search}<input id="searchInp" placeholder="Titel oder Autor suchen…" value="${esc(state.search)}"></div>
    </div>
    <div class="seg">${filters.map(([k, l]) =>
      `<button data-f="${k}" class="${state.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div style="height:16px"></div>
    ${list.length ? `<div class="shelf">${list.map(bookCardHTML).join("")}</div>` : emptyHTML()}`;

  const si = $("#searchInp");
  si.oninput = () => { state.search = si.value; const l = liveList(); $(".shelf") &&
    ($(".shelf").outerHTML = l.length ? `<div class="shelf">${l.map(bookCardHTML).join("")}</div>` : emptyHTML());
    bindCards(); };
  main.querySelectorAll(".seg button").forEach((b) =>
    b.onclick = () => { state.filter = b.dataset.f; renderMain(); });
  bindCards();
}

function liveList() {
  let list = state.books.slice();
  if (state.filter !== "all") list = list.filter((b) => (b.status || "read") === state.filter);
  if (state.search) { const q = state.search.toLowerCase();
    list = list.filter((b) => (b.title + " " + (b.author || "")).toLowerCase().includes(q)); }
  return list;
}
function bindCards() {
  document.querySelectorAll(".book").forEach((c) =>
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
  return `<div class="empty">${I.book}
    <h2>Dein Regal ist noch leer</h2>
    <p>Tippe auf <b>+</b> und sprich einfach ein Buch ein – „Soloalbum von Stuckrad-Barre“ – den Rest suche ich für dich.</p>
  </div>`;
}

// ================================================================
//  Statistik
// ================================================================
function renderStats(main) {
  const read = state.books.filter((b) => (b.status || "read") === "read");
  const pages = read.reduce((s, b) => s + (b.page_count || 0), 0);
  const rated = read.filter((b) => b.rating);
  const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : "–";
  const authors = new Set(read.map((b) => b.author).filter(Boolean));
  const top = [...read].filter((b) => b.rating >= 4).sort((a, b) => (b.rating - a.rating)).slice(0, 6);

  main.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="num">${read.length}</div><div class="lab">gelesene Bücher</div></div>
      <div class="stat-card"><div class="num">${pages.toLocaleString("de-DE")}</div><div class="lab">Seiten gesamt</div></div>
      <div class="stat-card"><div class="num">${authors.size}</div><div class="lab">verschiedene Autor:innen</div></div>
      <div class="stat-card"><div class="num">${avg}</div><div class="lab">Ø Bewertung</div></div>
    </div>
    ${top.length ? `<div class="section-title">Deine Favoriten</div>
      <div class="shelf">${top.map(bookCardHTML).join("")}</div>` : ""}

    <div class="section-title">Deine Daten</div>
    <p style="color:var(--ink-soft);font-size:13.5px;margin:-6px 0 12px">Deine Bücher gehören dir. Exportiere sie jederzeit oder hol dir eine Liste aus einer anderen App rein.</p>
    <div class="data-actions">
      <button class="btn" id="expCsv">CSV exportieren</button>
      <button class="btn" id="expJson">Backup (JSON)</button>
      <button class="btn" id="impBtn">Importieren</button>
    </div>
    <input type="file" id="impFile" accept=".csv,.json,text/csv,application/json" class="hidden">

    <div style="height:24px"></div>
    <button class="btn ghost block" id="logoutBtn" style="color:var(--ink-soft)">Abmelden</button>`;
  bindCards();
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
  } catch (e) { toast("Konnte Bücher nicht laden"); console.error(e); }
}

// ================================================================
//  Hinzufügen – Auswahl
// ================================================================
function openAdd() {
  const micLabel = CONFIG.TRANSCRIBE_URL ? "Buch einsprechen" : "Buch einsprechen";
  openSheet(`
    <h2>Buch hinzufügen</h2>
    <p class="sub">Sprich einfach los, tipp den Titel, scanne den Barcode oder lade eine EPUB.</p>
    <button class="mic-btn" id="micBtn">${I.mic}<span>${micLabel}</span></button>
    <div class="rec-status" id="recStatus"></div>
    <div class="or-div">oder</div>
    <div class="field-row">
      <div class="search">${I.search}<input id="titleInp" placeholder="Titel eingeben…" enterkeyhint="search"></div>
      <button class="btn primary" id="titleGo">Suchen</button>
    </div>
    <div class="secondary-row">
      <button class="btn" id="scanBtn">${I.scan} Barcode</button>
      <button class="btn" id="epubBtn">${I.epub} EPUB</button>
    </div>
    <input type="file" id="epubFile" accept=".epub" class="hidden">
  `);
  const doTyped = () => {
    const v = $("#titleInp").value.trim();
    if (!v) return;
    const parsed = parseUtterance(v);
    parsed.source = "manual";
    runSearch(parsed);
  };
  $("#micBtn").onclick = onMic;
  $("#titleGo").onclick = doTyped;
  $("#titleInp").addEventListener("keydown", (e) => { if (e.key === "Enter") doTyped(); });
  $("#scanBtn").onclick = openScanner;
  $("#epubBtn").onclick = () => $("#epubFile").click();
  $("#epubFile").onchange = (e) => { if (e.target.files[0]) onEpub(e.target.files[0]); };
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
      runSearch(parsed);
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
  if (btn) { btn.classList.remove("recording"); btn.querySelector("span").textContent = "Buch einsprechen"; }
  clearInterval(recTimerInt);
}

// ================================================================
//  Suche & Kandidaten
// ================================================================
const STATUS_LABEL = { read: "Gelesen", reading: "Lese gerade", want: "Will lesen" };

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

function showCandidates(results, parsed) {
  const { rawInput, status = "read", source = "manual" } = parsed;
  const intentNote = status !== "read"
    ? ` <span style="color:var(--accent);font-weight:600">→ ${STATUS_LABEL[status]}</span>` : "";
  openSheet(`
    <h2>Welches Buch ist es?</h2>
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
    openReview({ title: parsed.query || rawInput || "", raw_input: rawInput, status, source });
  };
}

// ================================================================
//  Review / Formular (neu ODER bearbeiten)
// ================================================================
const STATUSES = [["read", "Gelesen"], ["reading", "Lese gerade"], ["want", "Will lesen"]];

function bookFormHTML(b, isNew) {
  b = b || {};
  const missingWhen = (b.status || "read") === "read" && !b.date_finished;
  return `
    <div class="detail-hero">
      ${coverHTML(b, "").replace('class="cover-wrap ', 'style="width:112px" class="cover-wrap ')}
      <div class="dh-main">
        <div class="stars-input" id="stars">${[1,2,3,4,5].map((n) =>
          `<span class="s ${b.rating >= n ? "on" : ""}" data-n="${n}">★</span>`).join("")}</div>
        <div class="dh-facts">
          ${b.page_count ? b.page_count + " Seiten<br>" : ""}
          ${b.publisher ? esc(b.publisher) + "<br>" : ""}
          ${b.isbn13 ? "ISBN " + esc(b.isbn13) : ""}
        </div>
        ${b.title ? `<a class="amazon-link" href="${esc(amazonUrl(b))}" target="_blank" rel="noopener">Bei Amazon ansehen ↗</a>` : ""}
      </div>
    </div>

    <div class="status-pick" id="statusPick">
      ${STATUSES.map(([k, l]) => `<button data-s="${k}" class="${(b.status || "read") === k ? "on" : ""}">${l}</button>`).join("")}
    </div>

    <label class="fld"><span class="lbl">Titel</span>
      <input class="input" id="f_title" value="${esc(b.title)}"></label>
    <label class="fld"><span class="lbl">Autor:in</span>
      <input class="input" id="f_author" value="${esc(b.author || "")}" placeholder="wird gesucht…"></label>

    <div class="two-col">
      <label class="fld"><span class="lbl">Seiten</span>
        <input class="input" id="f_pages" type="number" inputmode="numeric" value="${b.page_count || ""}"></label>
      <label class="fld"><span class="lbl">Jahr</span>
        <input class="input" id="f_year" type="number" inputmode="numeric" value="${b.published_year || ""}"></label>
    </div>
    <label class="fld"><span class="lbl">Verlag</span>
      <input class="input" id="f_pub" value="${esc(b.publisher || "")}"></label>

    <div class="two-col">
      <label class="fld"><span class="lbl">Angefangen</span>
        <input class="input" id="f_start" type="date" value="${b.date_started || ""}"></label>
      <label class="fld"><span class="lbl">Beendet</span>
        <input class="input" id="f_finish" type="date" value="${b.date_finished || ""}"></label>
    </div>
    <label class="fld"><span class="lbl">Notizen / Gedanken</span>
      <textarea class="input" id="f_notes" placeholder="Was ist dir geblieben?">${esc(b.notes || "")}</textarea></label>
    <input type="hidden" id="f_isbn" value="${esc(b.isbn13 || "")}">

    ${missingWhen ? `<div class="hint">${I.info}<span>Magst du noch ergänzen, <b>wann</b> du es gelesen hast und <b>wie lange</b> du gebraucht hast? (optional)</span></div>` : ""}

    <div class="sheet-actions">
      ${isNew ? "" : `<button class="btn danger" id="delBtn">Löschen</button>`}
      <button class="btn primary" id="saveBtn">${isNew ? "Ins Regal stellen" : "Speichern"}</button>
    </div>`;
}

function openReview(b) {
  openSheet(bookFormHTML(b, true));
  bindForm(b, true);
}
function openDetail(b) {
  openSheet(bookFormHTML(b, false));
  bindForm(b, false);
}

function bindForm(b, isNew) {
  const draft = { ...b };
  draft.status = draft.status || "read";
  draft.rating = draft.rating || 0;

  // Sterne
  const paint = () => document.querySelectorAll("#stars .s").forEach((s) =>
    s.classList.toggle("on", draft.rating >= +s.dataset.n));
  document.querySelectorAll("#stars .s").forEach((s) =>
    s.onclick = () => { draft.rating = (draft.rating === +s.dataset.n) ? 0 : +s.dataset.n; paint(); });

  // Status
  document.querySelectorAll("#statusPick button").forEach((btn) =>
    btn.onclick = () => { draft.status = btn.dataset.s;
      document.querySelectorAll("#statusPick button").forEach((x) => x.classList.toggle("on", x === btn)); });

  const saveBtn = $("#saveBtn");
  saveBtn.onclick = async () => {
    const rec = {
      title: $("#f_title").value.trim(),
      author: $("#f_author").value.trim() || null,
      page_count: parseInt($("#f_pages").value) || null,
      published_year: parseInt($("#f_year").value) || null,
      publisher: $("#f_pub").value.trim() || null,
      date_started: $("#f_start").value || null,
      date_finished: $("#f_finish").value || null,
      notes: $("#f_notes").value.trim() || null,
      status: draft.status,
      rating: draft.rating || null,
      isbn13: $("#f_isbn").value || draft.isbn13 || null,
    };
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

  // Wenn Autor noch fehlt: im Hintergrund nachschlagen
  if (isNew && !draft.author && draft.title) {
    searchBooks(draft.title).then((r) => {
      if (r[0] && $("#f_author") && !$("#f_author").value) {
        const g = r[0];
        if (g.author) $("#f_author").value = g.author;
        if (g.page_count && !$("#f_pages").value) $("#f_pages").value = g.page_count;
        if (g.published_year && !$("#f_year").value) $("#f_year").value = g.published_year;
        if (g.publisher && !$("#f_pub").value) $("#f_pub").value = g.publisher;
        if (g.isbn13) $("#f_isbn").value = g.isbn13;
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
      <div class="c-meta">${esc(b.author || "Unbekannt")}${b.status !== "read" ? " · " + STATUS_LABEL[b.status] : ""}</div></div></div>`).join("");

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
