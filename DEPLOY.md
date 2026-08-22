# Deployment – Playlist Konverter

Serverseitige Befehle für Updates. Checkout liegt in `/opt/playliste-konverter`,
Webroot ist `/var/www/kodinitools.com/playlistkonverter/`.

Der Konvertierungsdienst läuft als Node-Prozess unter **pm2**
(`playlistkonverter-server`, Port **9016**); `deploy.sh` baut das Frontend aus
`origin/main` und lädt den Dienst neu.

---

## 1. Einmaliger Rollout (Umstellung auf den Node-Dienst)

Nur beim ersten Mal nötig – danach reicht der Routine-Deploy (Abschnitt 2).

```bash
cd /opt/playliste-konverter

# Aktuellen Stand holen (Branch muss nach main gemergt sein, da deploy.sh
# hart auf origin/main zurücksetzt):
git fetch origin
git checkout main && git pull

# Node-Konvertierungsdienst installieren & starten (Port 9016):
cd server
npm ci --omit=dev
pm2 start ecosystem.config.cjs
pm2 save                                   # Autostart nach Reboot merken
curl -s http://127.0.0.1:9016/health       # erwartet: {"status":"ok",...}
cd ..

# nginx umstellen: den "PLAYLIST CONVERTER"-Block in
#   /etc/nginx/sites-enabled/kodinitools.com
# durch den Inhalt von deploy/nginx-playlistkonverter.conf ersetzen
sudo nano /etc/nginx/sites-enabled/kodinitools.com
sudo nginx -t && sudo systemctl reload nginx
```

Voraussetzung: `ffmpeg` und `ffprobe` sind installiert (`ffmpeg -version`).

---

## 2. Routine-Deploy (Standard – z. B. nach Text-/Frontend-Änderungen)

Nachdem der Branch nach `main` gemergt ist:

```bash
cd /opt/playliste-konverter
./deploy.sh
```

`deploy.sh` erledigt: `git reset --hard origin/main` → Frontend bauen →
Webroot synchronisieren → `npm ci` + `pm2 startOrReload` des Node-Dienstes →
`nginx -t` + reload.

Nur Frontend deployen, ohne nginx neu zu laden:

```bash
RELOAD_NGINX=0 ./deploy.sh
```

---

## 3. Einzelschritte (manuell, falls ohne deploy.sh)

Frontend neu bauen & ausrollen:

```bash
cd /opt/playliste-konverter
git fetch origin && git checkout main && git pull
npm ci
npm run build
rsync -a --delete --exclude '/backend' --exclude '/backend/**' \
  dist/ /var/www/kodinitools.com/playlistkonverter/
```

Nur den Node-Dienst aktualisieren:

```bash
cd /opt/playliste-konverter/server
git -C .. pull
npm ci --omit=dev
pm2 reload playlistkonverter-server
```

nginx testen & neu laden:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. pm2-Verwaltung & Diagnose

```bash
pm2 list                              # Status aller Dienste
pm2 logs playlistkonverter-server     # Live-Logs
pm2 restart playlistkonverter-server  # Neustart
pm2 stop playlistkonverter-server     # Stoppen
pm2 save                              # aktuellen Prozesssatz für Reboot sichern

curl -s http://127.0.0.1:9016/health  # Health-Check des Dienstes
```

---

## Hinweise

- `deploy.sh` deployt immer aus **`origin/main`** – Änderungen vorher dorthin
  mergen.
- Der Node-Dienst lauscht nur auf `127.0.0.1:9016`; öffentlich erreichbar ist er
  ausschließlich über den nginx-Proxy `/playlistkonverter/api/`.
- Sessions/Temp-Dateien werden nach dem Download sowie automatisch nach 1 Stunde
  gelöscht – ein separater Cleanup-Cronjob ist nicht mehr nötig.
- Die alten PHP-Dateien unter `backend/` werden nicht mehr angesprochen, sobald
  nginx auf Port 9016 zeigt.
