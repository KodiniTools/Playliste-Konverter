# Playlist zu WebM Konverter

Server-basiertes Tool zum Konvertieren von bis zu 100 MP3/WAV Tracks in eine WebM-Datei.

## Features

- Multi-File Upload (Drag & Drop)
- Track-Reihenfolge änderbar
- Fortschrittsanzeige (Upload + Konvertierung)
- Server-seitige FFmpeg-Verarbeitung
- Automatisches Cleanup nach Download

## Tech-Stack

### Frontend
- Vue 3 (Composition API)
- Pinia (State Management)
- Tailwind CSS
- Axios
- Vite

### Backend
- PHP 8.3
- FFmpeg
- Nginx

## Installation

### 1. Frontend bauen

```powershell
npm install
npm run build
```

### 2. Upload zum Server

```powershell
# Frontend
scp -r dist/* root@145.223.81.100:/var/www/kodinitools.com/playlistkonverter/

# Backend
scp -r backend root@145.223.81.100:/var/www/kodinitools.com/playlistkonverter/
```

### 3. Server-Konfiguration

**Nginx Config ergänzen** (`/etc/nginx/sites-available/kodinitools.com`):

```nginx
# Frontend
location /playlistkonverter/ {
    alias /var/www/kodinitools.com/playlistkonverter/;
    try_files $uri $uri/ /playlistkonverter/index.html;
}

# Backend API
location /playlistkonverter/api/ {
    alias /var/www/kodinitools.com/playlistkonverter/backend/api/;
    
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $request_filename;
        include fastcgi_params;
    }
}
```

**Temp-Verzeichnis & Rechte:**

```bash
chown -R www-data:www-data /var/www/kodinitools.com/playlistkonverter/backend/temp
chmod 755 /var/www/kodinitools.com/playlistkonverter/backend/temp
```

**FFmpeg installieren:**

```bash
ffmpeg -version
# Falls nicht installiert:
apt install ffmpeg
```

**PHP-Konfiguration anpassen** (`/etc/php/8.3/fpm/php.ini`):

```ini
upload_max_filesize = 1GB
post_max_size = 1GB
max_execution_time = 300
memory_limit = 512M
```

**PHP-FPM neu starten:**

```bash
systemctl restart php8.3-fpm
```

**Nginx neu laden:**

```bash
nginx -t
systemctl reload nginx
```

### 4. Automatisches Cleanup einrichten

**Cron für alte Sessions (älter als 24h):**

```bash
crontab -e
# Folgende Zeile hinzufügen:
0 2 * * * find /var/www/kodinitools.com/playlistkonverter/backend/temp/* -mtime +1 -exec rm -rf {} \;
```

## Development

```bash
npm install
npm run dev
```

Vite-Proxy leitet `/api` Requests zu `localhost:3008` weiter.

## Dateistruktur

```
vue-playlist-converter/
├── src/
│   ├── components/
│   │   ├── FileUploader.vue
│   │   ├── FileList.vue
│   │   ├── ConversionProgress.vue
│   │   └── DownloadButton.vue
│   ├── stores/
│   │   └── converter.js
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── backend/
│   ├── api/
│   │   ├── upload.php
│   │   ├── convert.php
│   │   ├── status.php
│   │   ├── download.php
│   │   └── .htaccess
│   └── temp/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── deploy.ps1
└── README.md
```

## API-Endpoints

### POST /api/upload
Empfängt Dateien und erstellt Session.

### POST /api/convert
Startet FFmpeg-Konvertierung.

### GET /api/status/{session_id}
Fragt Konvertierungsstatus ab (Polling).

### GET /api/download/{session_id}
Lädt fertige WebM-Datei herunter.

## Limitierungen

- Max Upload-Größe: 1GB (PHP-konfigurierbar)
- Max Tracks: 100 (empfohlen)
- RAM: ~200MB + Dateigröße für FFmpeg
- Timeout: 5 Min (PHP-konfigurierbar)

## Troubleshooting

**Upload-Fehler:**
- PHP-Limits prüfen: `php -i | grep upload`
- Temp-Rechte prüfen: `ls -la backend/temp/`

**FFmpeg-Fehler:**
- Log ansehen: `backend/temp/{session_id}/ffmpeg.log`
- FFmpeg testen: `ffmpeg -version`

**Nginx-Fehler:**
- Error-Log: `tail -f /var/log/nginx/error.log`
- Config-Test: `nginx -t`

## License

MIT License

## Autor
Dinko Ramić, Kodini Tools, kodinitools.com

