// Leselog – zentrale Konfiguration
// Diese Werte sind bewusst öffentlich (der Publishable-Key ist durch RLS geschützt).
export const CONFIG = {
  SUPABASE_URL: "https://wejvvldovywrernuujgt.supabase.co",
  SUPABASE_KEY: "sb_publishable_ZyFVdlb-Kxuvo6T5SJ43cw_I5l6LBTz",

  // Google Books API-Key (nur Books API freigeschaltet) – eigenes Kontingent, keine 429 mehr.
  GBOOKS_KEY: "AIzaSyC6NrAnOw5HqnbyUt6_IA7VyHl623FHUQU",

  // TMDb API-Key (v3) für Filme & Serien.
  TMDB_KEY: "d87a53b54092bf1296abdb9c8c6248eb",

  // Cloudflare Worker für die gute KI-Transkription (ElevenLabs Scribe).
  // Solange leer: das iPhone transkribiert selbst (Offline-Notnagel).
  TRANSCRIBE_URL: "",

  // Anna's Archive – Domain wechselt gelegentlich.
  // Stand 29.07.2026 erreichbar: .gl, .pk, .gd  (.org und .se werden vom DNS geblockt).
  // Aktuellen Status prüfen: https://open-slum.org
  // Wenn der Link mal ins Leere geht: hier auf einen der Ersatzspiegel wechseln.
  ANNAS_ARCHIVE_URL: "https://annas-archive.gl",
  ANNAS_ARCHIVE_MIRRORS: ["https://annas-archive.gl", "https://annas-archive.pk", "https://annas-archive.gd"],

  // Weitere Schattenbibliotheken als Rückfall, wenn Anna's Archive nichts findet.
  // Stand 29.09.2026 geprüft: libgen.li + libgen.vg antworten (.is/.rs/.gs tot),
  // Z-Library unter z-library.sk (Bot-Sperre: nur im echten Browser, curl kriegt 517), Liber3 (IPFS-Index über LibGen/Z-Lib) unter liber3.eth.limo.
  // Anna's Archive enthält LibGen und Z-Library bereits – die Links helfen vor allem,
  // wenn Anna's gerade klemmt oder der Deutsch/EPUB-Filter dort zu streng war
  // (die Rückfall-Links suchen ohne Filter, finden also auch PDFs).
  LIBGEN_URL: "https://libgen.li",
  ZLIB_URL: "https://z-library.sk",
  LIBER3_URL: "https://liber3.eth.limo",

  // Vermittler für die Deutsche Nationalbibliothek (CORS). Findet zu englischen
  // Büchern die deutsche Ausgabe. Quelltext in worker-dnb/.
  DNB_PROXY_URL: "https://leselog-dnb.florian-s-thiel.workers.dev/",

  // Datei-Speicher für EPUBs + Archiv-Cover (Cloudflare R2). Quelltext in worker-dateien/.
  FILES_URL: "https://leselog-dateien.florian-s-thiel.workers.dev",

  // App-Meta
  APP_NAME: "Leselog",
};
