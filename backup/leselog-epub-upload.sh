#!/bin/bash
# Lädt zugeordnete EPUB-Dateien in den privaten Supabase-Bucket "epubs"
# und trägt Pfad/Name/Größe am jeweiligen Buch ein.
#
# Erwartet eine JSON-Datei mit Einträgen: {book_id, epub, book}
# Aufruf:  ./leselog-epub-upload.sh matches.json
#
# Braucht den service_role-Key im Schlüsselbund (wie das Backup-Skript):
#   security add-generic-password -s leselog-service-key -a leselog -w 'DEIN_SERVICE_ROLE_KEY'

set -euo pipefail

SUPABASE_URL="https://wejvvldovywrernuujgt.supabase.co"
USER_ID="f02e6399-41bf-427d-95c7-a368054e0859"
MATCHES="${1:?Bitte JSON-Datei mit den Zuordnungen angeben}"

KEY="$(security find-generic-password -s leselog-service-key -a leselog -w 2>/dev/null || true)"
if [ -z "$KEY" ]; then
  echo "FEHLER: Kein service_role-Key im Schlüsselbund (leselog-service-key)." >&2
  echo "Anlegen mit: security add-generic-password -s leselog-service-key -a leselog -w 'KEY'" >&2
  exit 1
fi

count=0; fail=0
while IFS=$'\t' read -r book_id path title; do
  [ -z "${book_id:-}" ] && continue
  [ -f "$path" ] || { echo "  fehlt: $path" >&2; fail=$((fail+1)); continue; }

  name="$(basename "$path")"
  size="$(stat -f%z "$path")"
  object="$USER_ID/$book_id.epub"

  http="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    "$SUPABASE_URL/storage/v1/object/$object" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/epub+zip" \
    -H "x-upsert: true" \
    --data-binary "@$path")"

  if [ "$http" != "200" ] && [ "$http" != "201" ]; then
    echo "  Upload fehlgeschlagen ($http): $title" >&2; fail=$((fail+1)); continue
  fi

  esc_name="$(printf '%s' "$name" | sed 's/"/\\"/g')"
  http2="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
    "$SUPABASE_URL/rest/v1/books?id=eq.$book_id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"epub_path\":\"$object\",\"epub_name\":\"$esc_name\",\"epub_size\":$size}")"

  if [ "$http2" != "204" ] && [ "$http2" != "200" ]; then
    echo "  DB-Eintrag fehlgeschlagen ($http2): $title" >&2; fail=$((fail+1)); continue
  fi

  count=$((count+1))
  echo "  ✓ $title  ($(echo "scale=1; $size/1048576" | bc) MB)"
done < <(python3 -c "
import json,sys
for r in json.load(open('$MATCHES')):
    if r.get('epub'):
        print('\t'.join([r['book_id'], r['epub'], r['book']]))
")

echo
echo "Fertig: $count hochgeladen, $fail Fehler."
