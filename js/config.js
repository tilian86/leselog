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

  // App-Meta
  APP_NAME: "Leselog",
};
