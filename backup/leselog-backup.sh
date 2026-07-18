#!/bin/bash
# Leselog-Backup: sichert das komplette Regal aus Supabase als JSON.
# Läuft per launchd (siehe de.florianthiel.leselog-backup.plist).
# Behält immer nur die KEEP neuesten Sicherungen, löscht ältere.
#
# Einrichtung (einmalig): Service-Role-Key im Schlüsselbund ablegen:
#   security add-generic-password -s leselog-service-key -a leselog -w 'DEIN_SERVICE_ROLE_KEY'
# Key findest du im Supabase-Dashboard unter:
#   Project Settings -> API -> service_role (secret)

set -euo pipefail

SUPABASE_URL="https://wejvvldovywrernuujgt.supabase.co"
BACKUP_DIR="$HOME/Leselog-Backups"
KEEP=2

# Service-Role-Key sicher aus dem Schlüsselbund holen
KEY="$(security find-generic-password -s leselog-service-key -a leselog -w 2>/dev/null || true)"
if [ -z "$KEY" ]; then
  echo "$(date '+%F %T')  FEHLER: Kein Service-Role-Key im Schlüsselbund (leselog-service-key)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y%m%d-%H%M')"
TMP="$(mktemp)"
OUT="$BACKUP_DIR/leselog-$STAMP.json"

# Alle Zeilen holen (service_role umgeht RLS -> komplettes Regal)
HTTP="$(curl -sS -o "$TMP" -w '%{http_code}' \
  "$SUPABASE_URL/rest/v1/books?select=*&order=created_at.desc" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY")"

# Nur bei gültiger, nicht-leerer JSON-Liste die Sicherung behalten
if [ "$HTTP" != "200" ]; then
  echo "$(date '+%F %T')  FEHLER: HTTP $HTTP von Supabase." >&2
  rm -f "$TMP"; exit 1
fi
if ! head -c1 "$TMP" | grep -q '\['; then
  echo "$(date '+%F %T')  FEHLER: Antwort ist keine JSON-Liste." >&2
  rm -f "$TMP"; exit 1
fi
COUNT="$(grep -o '"id"' "$TMP" | wc -l | tr -d ' ')"
if [ "$COUNT" = "0" ]; then
  echo "$(date '+%F %T')  WARNUNG: 0 Einträge – Sicherung wird verworfen (schützt vorhandene Backups)." >&2
  rm -f "$TMP"; exit 0
fi

mv "$TMP" "$OUT"
echo "$(date '+%F %T')  OK: $COUNT Einträge -> $OUT"

# Rotation: nur die KEEP neuesten .json behalten
ls -1t "$BACKUP_DIR"/leselog-*.json 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "$(date '+%F %T')  entfernt (Rotation): $old"
done
