# Playlist Konverter – Node-Konvertierungsdienst

Dauerhafter Node-Dienst (unter **pm2**, Port **9016**), der die serverseitige
Konvertierung übernimmt. Er ersetzt die bisherige PHP-/Queue-Worker-Lösung, bei
der die Konvertierung ohne laufenden Worker bei ~96 % hängen blieb.

Ein dauerhafter Prozess hält den Job im Speicher und verfolgt den echten
ffmpeg-Fortschritt (`time=` aus dem ffmpeg-Log gegen die Gesamtdauer) – dadurch
läuft der Fortschritt bis 100 % und die Datei steht danach zum Download bereit.

## API (identisch zum bisherigen Vertrag)

| Methode | Pfad (hinter nginx)                     | Zweck |
|---------|------------------------------------------|-------|
| POST    | `/playlistkonverter/api/upload`          | Eine Datei pro Request (`files[]`), Session-basiert |
| POST    | `/playlistkonverter/api/convert`         | Startet die Konvertierung (`session_id`, `format`, `bitrate`) |
| GET     | `/playlistkonverter/api/status/<id>`     | `{ status, progress, file_size?, error? }` |
| GET     | `/playlistkonverter/api/download/<id>`   | Liefert die fertige Datei, räumt danach auf |
| GET     | `/playlistkonverter/health`              | Health-Check |

Da die Pfade unverändert sind, **muss das Frontend nicht angepasst werden** –
nur nginx leitet `/playlistkonverter/api/` jetzt an den Node-Dienst statt an
PHP-FPM weiter.

## Voraussetzungen

- Node.js (dieselbe Version wie die übrigen Kodini-Dienste)
- `ffmpeg` und `ffprobe` im `PATH` (oder via `FFMPEG_PATH` / `FFPROBE_PATH`)

## Einrichtung auf dem Server

```bash
cd /opt/playliste-konverter/server
npm ci --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 list          # playlistkonverter-server sollte "online" sein
curl -s http://127.0.0.1:9016/health   # {"status":"ok",...}
```

## nginx umstellen

Den bisherigen `# ===== PLAYLIST CONVERTER =====`-Abschnitt in
`/etc/nginx/sites-enabled/kodinitools.com` durch den Inhalt von
[`../deploy/nginx-playlistkonverter.conf`](../deploy/nginx-playlistkonverter.conf)
ersetzen (Frontend bleibt statisch, API/Health gehen an Port 9016), dann:

```bash
nginx -t && systemctl reload nginx
```

## Konfiguration (Umgebungsvariablen)

| Variable         | Standard          | Bedeutung |
|------------------|-------------------|-----------|
| `PORT`           | `9016`            | Listen-Port (nur `127.0.0.1`) |
| `TEMP_DIR`       | `<server>/temp`   | Verzeichnis für Sessions/Uploads |
| `MAX_CONCURRENT` | `3`               | Max. gleichzeitige ffmpeg-Prozesse |
| `FFMPEG_PATH`    | `ffmpeg`          | Pfad zur ffmpeg-Binary |
| `FFPROBE_PATH`   | `ffprobe`         | Pfad zur ffprobe-Binary |

## Hinweise

- Der Dienst lauscht nur auf `127.0.0.1`; öffentlich erreichbar ist er
  ausschließlich über den nginx-Proxy.
- Sessions werden nach dem Download sowie automatisch nach 1 Stunde entfernt;
  ein periodischer Cleanup (alle 15 min) räumt zusätzlich verwaiste
  Verzeichnisse auf. Der bisherige PHP-Cleanup-Cronjob wird dafür nicht mehr
  benötigt.
- Die PHP-Dateien unter `backend/` bleiben im Repo, werden aber nicht mehr
  angesprochen, sobald nginx auf den Node-Dienst zeigt.
