#!/bin/bash
# Leselog-Sicherungen vom Funk-Server auf den Mac holen.
# Das eigentliche Backup läuft täglich um 09:30 auf dem Funk-Server
# (funk-server/jobs/leselog-backup.sh) und behält dort nur 7 Stände.
# Dieses Skript holt sie nach ~/Leselog-Backups. Von dort nimmt die
# Sonntags-Sicherung (~/bin/cloud-backup.sh) sie mit nach Dropbox.
# So überlebt das Regal auch einen Ausfall des Servers.
# Läuft per launchd (siehe de.florianthiel.leselog-backup-holen.plist).
# Veraltet die neueste Kopie, meldet es die Funkzentrale (melder.py → sicherung()).

set -uo pipefail

SERVER="funk-server"   # Kurzname aus ~/.ssh/config (Adresse, Login, Schlüssel)
QUELLE="/home/funk/backups/leselog"
ZIEL="$HOME/Leselog-Backups"
KEEP=90   # etwa drei Monate; ältere liegen ohnehin in Dropbox
LOG="$ZIEL/holen.log"

mkdir -p "$ZIEL"
log() { echo "$(date '+%F %T')  $*" >> "$LOG"; }

# Nach dem Aufwachen ist das Netz manchmal noch nicht da, also drei Versuche.
for versuch in 1 2 3; do
  if scp -p -q -o BatchMode=yes -o ConnectTimeout=20 \
       "$SERVER:$QUELLE/leselog-*.json" "$ZIEL/" 2>>"$LOG"; then
    break
  fi
  if [ "$versuch" = 3 ]; then
    log "FEHLER: Funk-Server nicht erreichbar, nichts geholt."
    exit 1
  fi
  sleep 60
done

# Nur die KEEP neuesten behalten. Die Namen tragen das Datum
# (leselog-JJJJMMTT-HHMM.json), die Shell sortiert sie also schon richtig.
alle=( "$ZIEL"/leselog-*.json )
zuviel=$(( ${#alle[@]} - KEEP ))
for (( i=0; i<zuviel; i++ )); do rm -f "${alle[$i]}"; done

alle=( "$ZIEL"/leselog-*.json )
log "OK: ${#alle[@]} Stände auf dem Mac, neuester $(basename "${alle[${#alle[@]}-1]}")"
