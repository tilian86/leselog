// Leselog – zentrale Konfiguration
// Diese Werte sind bewusst öffentlich (der Publishable-Key ist durch RLS geschützt).
export const CONFIG = {
  SUPABASE_URL: "https://wejvvldovywrernuujgt.supabase.co",
  SUPABASE_KEY: "sb_publishable_ZyFVdlb-Kxuvo6T5SJ43cw_I5l6LBTz",

  // Cloudflare Worker für die gute KI-Transkription (ElevenLabs Scribe).
  // Solange leer: das iPhone transkribiert selbst (Offline-Notnagel).
  TRANSCRIBE_URL: "",

  // App-Meta
  APP_NAME: "Leselog",
};
