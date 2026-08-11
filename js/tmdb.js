// Filme & Serien über TMDb (The Movie Database) holen.
import { CONFIG } from "./config.js";

const IMG = "https://image.tmdb.org/t/p/w500";
const API = "https://api.themoviedb.org/3";

function q(params) {
  return API + params + (params.includes("?") ? "&" : "?") +
    "api_key=" + CONFIG.TMDB_KEY + "&language=de-DE";
}
function year(d) { const m = String(d || "").match(/\d{4}/); return m ? parseInt(m[0], 10) : null; }

// media: "movie" | "series"  (TMDb nennt Serien "tv")
function tvOrMovie(media) { return media === "series" ? "tv" : "movie"; }

function normalize(item, media) {
  const isTv = media === "series";
  return {
    media_type: media,
    tmdb_id: item.id,
    title: isTv ? (item.name || item.original_name) : (item.title || item.original_title),
    author: null, // wird bei Details gefüllt (Regie/Macher)
    published_year: year(isTv ? item.first_air_date : item.release_date),
    cover_url: item.poster_path ? IMG + item.poster_path : null,
    description: item.overview || null,
    web_rating: item.vote_average ? Math.round(item.vote_average) / 2 : null, // 10er → 5er Skala
    web_rating_count: item.vote_count || null,
  };
}

export async function searchMedia(query, media) {
  const res = await fetch(q("/search/" + tvOrMovie(media) + "?query=" + encodeURIComponent(query.trim()) + "&include_adult=false"));
  if (!res.ok) throw new Error("TMDb nicht erreichbar");
  const data = await res.json();
  const items = (data.results || []).filter((x) => x.poster_path || x.overview);
  return items.slice(0, 8).map((i) => normalize(i, media));
}

// Volle Details inkl. Regie/Macher, Laufzeit, Staffeln/Folgen
export async function getMediaDetails(tmdbId, media) {
  const isTv = media === "series";
  const res = await fetch(q("/" + tvOrMovie(media) + "/" + tmdbId + "?append_to_response=credits"));
  if (!res.ok) return {};
  const d = await res.json();
  const patch = {
    description: d.overview || null,
    web_rating: d.vote_average ? Math.round(d.vote_average) / 2 : null,
    web_rating_count: d.vote_count || null,
    published_year: year(isTv ? d.first_air_date : d.release_date),
    cover_url: d.poster_path ? IMG + d.poster_path : null,
  };
  if (isTv) {
    patch.total_seasons = d.number_of_seasons || null;
    patch.total_episodes = d.number_of_episodes || null;
    patch.author = (d.created_by || []).map((c) => c.name).join(", ") || null;
  } else {
    patch.runtime = d.runtime || null;
    const dir = (d.credits && d.credits.crew || []).find((c) => c.job === "Director");
    patch.author = dir ? dir.name : null;
  }
  return patch;
}

// TMDb-Detailseite (für einen "ansehen"-Link)
export function tmdbUrl(b) {
  const kind = b.media_type === "series" ? "tv" : "movie";
  return b.tmdb_id ? `https://www.themoviedb.org/${kind}/${b.tmdb_id}` : null;
}

// ---------- Wo läuft's? (Streaming-Anbieter, Daten von JustWatch über TMDb) ----------
const LOGO = "https://image.tmdb.org/t/p/w92";
const provCache = new Map();

export async function getWatchProviders(tmdbId, media, region = "DE") {
  if (!tmdbId) return null;
  const key = `${media}:${tmdbId}:${region}`;
  if (provCache.has(key)) return provCache.get(key);
  let out = null;
  try {
    const res = await fetch(q("/" + tvOrMovie(media) + "/" + tmdbId + "/watch/providers"));
    if (res.ok) {
      const r = (await res.json()).results || {};
      const d = r[region];
      if (d) {
        const map = (arr) => (arr || []).map((p) => ({
          name: p.provider_name,
          logo: p.logo_path ? LOGO + p.logo_path : null,
        }));
        out = {
          flatrate: map(d.flatrate),      // im Abo enthalten
          free: map(d.free),              // wirklich gratis
          ads: map(d.ads),                // gratis mit Werbung
          rent: map(d.rent), buy: map(d.buy),
          link: d.link || null,
        };
      } else {
        out = { flatrate: [], free: [], ads: [], rent: [], buy: [], link: null };
      }
    }
  } catch (_) { out = null; }
  provCache.set(key, out);
  return out;
}

// Kurzfassung für Kachel/Zeile: nur die kostenfreien Wege
export function freeProviderNames(wp) {
  if (!wp) return [];
  const seen = new Set(), out = [];
  [...(wp.free || []), ...(wp.ads || []), ...(wp.flatrate || [])].forEach((p) => {
    if (!seen.has(p.name)) { seen.add(p.name); out.push(p.name); }
  });
  return out;
}
