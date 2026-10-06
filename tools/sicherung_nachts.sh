#!/bin/bash
# Nächtliche Drive-Sicherung aller Leselog-EPUBs (launchd 03:45, de.florianthiel.leselog-drive-sicherung).
# macOS lässt Hintergrund-Python nicht in den Google-Drive-Ordner – deshalb erst in einen lokalen
# Spiegel (~/.leselog-sicherung/E-Books) holen und den per rclone nach Drive schieben.
# Geht etwas schief, kommt ein Push in die Pushfunk-App (seit 06.10.2026, vorher ntfy).
export PATH="$HOME/.local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SPIEGEL="$HOME/.leselog-sicherung/E-Books"
DRIVE="gdrive:Diverses/E-Books (Leselog-Sicherung)"
cd "$(dirname "$0")/.." || exit 1
mkdir -p "$SPIEGEL"
echo "=== $(date '+%F %T')"
out=$(LESELOG_SICHERUNG_ZIEL="$SPIEGEL" /usr/bin/python3 tools/sicherung_drive.py 2>&1); rc=$?
echo "$out" | tail -30
if [ $rc -eq 0 ]; then
  # --checksum: gleiche Datei = gleicher Inhalt, egal welches Datum. Gelöschtes landet im Drive-Papierkorb.
  # Die PDFs aus Calibre liegen nur in Drive und bleiben unangetastet.
  sync=$("$HOME/bin/rclone" sync "$SPIEGEL" "$DRIVE" --checksum --exclude "/_PDFs aus Calibre/**" --exclude ".DS_Store" \
    --retries 3 --low-level-retries 10 --stats-one-line -v 2>&1); rc=$?
  echo "$sync" | grep -v -e "client_id" -e "directory modification time" | tail -15
  [ $rc -ne 0 ] && out="rclone nach Drive: $(echo "$sync" | grep -i error | tail -1)"
fi
if [ $rc -ne 0 ]; then
  PUSH_APP=pushfunk PUSH_QUELLE=leselog-sicherung "$HOME/Projects/apps/claude-limit-waechter/push.sh" \
    "⚠️ 📚 Leselog-Sicherung" "Drive-Sicherung der EPUBs hat gehakt: $(echo "$out" | tail -1)"
fi
exit $rc
