# Leselog 📚

Ein kluges, persönliches Logbuch für gelesene Bücher – als installierbare Web-App (PWA) fürs iPhone.

- **Einsprechen, tippen, Barcode scannen oder EPUB laden** → Titel, Autor, ISBN, Seiten, Verlag & Cover werden automatisch aus dem Netz ergänzt (Google Books + OpenLibrary).
- **Schönes Cover-Regal**, Bewertungen, Lese-Status, Notizen und Statistiken.
- **Gute KI-Transkription** über einen Cloudflare Worker (ElevenLabs Scribe); das iPhone-eigene Transkribieren dient als Offline-Notnagel.
- **Daten** liegen sicher in Supabase (Login per Magic-Link, Row Level Security).

## Struktur
- `index.html`, `css/`, `js/` – die statische PWA (GitHub Pages)
- `js/config.js` – Supabase- & Worker-URLs
- `worker/` – Cloudflare Worker für die Transkription

## Vorschau ohne Login
`index.html#demo` zeigt das Design mit Beispieldaten.
