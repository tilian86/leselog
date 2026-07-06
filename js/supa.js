// Supabase-Client, Auth und Datenzugriff
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "./config.js";

export const supa = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function currentSession() {
  const { data } = await supa.auth.getSession();
  return data.session;
}

export function onAuth(cb) {
  supa.auth.onAuthStateChange((_ev, session) => cb(session));
}

// Magic-Link an die E-Mail schicken (kein Passwort nötig)
export async function sendMagicLink(email) {
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await supa.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });
  if (error) throw error;
}

// E-Mail + Passwort (funktioniert überall, auch in der Home-Screen-App)
export async function signInPassword(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signUpPassword(email, password) {
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() { await supa.auth.signOut(); }

// ---------- Bücher ----------
export async function fetchBooks() {
  const { data, error } = await supa
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Spalten, die evtl. noch nicht in der DB existieren (Migration ausstehend) -> notfalls weglassen
const OPTIONAL_COLS = ["web_rating", "web_rating_count"];
const isMissingCol = (e) =>
  e && (e.code === "PGRST204" || /column|schema cache|web_rating/i.test(e.message || ""));
const stripOptional = (o) => { const c = { ...o }; OPTIONAL_COLS.forEach((k) => delete c[k]); return c; };

export async function insertBook(book) {
  let { data, error } = await supa.from("books").insert(book).select().single();
  if (error && isMissingCol(error)) {
    ({ data, error } = await supa.from("books").insert(stripOptional(book)).select().single());
  }
  if (error) throw error;
  return data;
}

// Viele Bücher auf einmal einfügen (Import). user_id füllt die DB per Default (auth.uid()).
export async function insertBooks(books) {
  let { data, error } = await supa.from("books").insert(books).select();
  if (error && isMissingCol(error)) {
    ({ data, error } = await supa.from("books").insert(books.map(stripOptional)).select());
  }
  if (error) throw error;
  return data || [];
}

export async function updateBook(id, patch) {
  const { data, error } = await supa.from("books").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function removeBook(id) {
  const { error } = await supa.from("books").delete().eq("id", id);
  if (error) throw error;
}
