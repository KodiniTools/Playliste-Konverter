# Context.md - Playliste-Konverter

## Projektübersicht

**Playliste-Konverter** ist eine Full-Stack-Webanwendung zum Zusammenfügen mehrerer Audio-Dateien (MP3/WAV) zu einer einzelnen Ausgabedatei. Die Anwendung bietet eine moderne, benutzerfreundliche Oberfläche mit Drag & Drop-Unterstützung und Echtzeit-Fortschrittsanzeige.

### Hauptfunktionen

- Multi-Datei-Upload mit Drag & Drop
- Track-Neuordnung per Drag & Drop
- Audio-Vorschau für einzelne Tracks
- Mehrere Ausgabeformate: WebM (Opus), MP3, OGG (Vorbis)
- Konfigurierbare Audio-Qualität (64-320 kbps)
- Echtzeit-Fortschrittsanzeige mit Upload-Geschwindigkeit
- Optionales Warteschlangen-System für hohe Last
- Automatische Bereinigung temporärer Dateien
- Zweisprachige Oberfläche (Deutsch/Englisch)
- Dark Mode-Unterstützung

---

## Technologie-Stack

### Frontend

| Technologie | Version | Zweck |
|-------------|---------|-------|
| Vue 3 | Composition API | JavaScript-Framework |
| Pinia | 2.3.0 | State Management |
| Vite | 5.4.0 | Build-Tool & Dev-Server |
| Tailwind CSS | 3.4.0 | Utility-First CSS |
| Vue-i18n | 9.14.0 | Internationalisierung |
| Axios | 1.13.0 | HTTP-Client |

### Backend

| Technologie | Zweck |
|-------------|-------|
| PHP 8.3 | Server-seitige Logik |
| FFmpeg | Audio-Verarbeitung |
| SQLite | Warteschlangen-Datenbank |
| Nginx | Webserver |

---

## Projektstruktur

```
/Playliste-Konverter/
├── src/                          # Vue 3 Frontend
│   ├── components/               # Vue-Komponenten
│   │   ├── FileUploader.vue      # Drag & Drop Upload
│   │   ├── FileList.vue          # Playlist-Verwaltung
│   │   ├── FormatSelector.vue    # Format/Bitrate-Auswahl
│   │   ├── ConversionProgress.vue # Fortschrittsanzeige
│   │   ├── DownloadButton.vue    # Datei-Download
│   │   ├── SizeWarning.vue       # Größenwarnungen
│   │   ├── SettingsSwitcher.vue  # Theme/Sprache-Umschalter
│   │   ├── FAQ.vue               # FAQ-Bereich
│   │   └── ToastContainer.vue    # Benachrichtigungen
│   ├── stores/                   # Pinia State Management
│   │   ├── converter.js          # Haupt-Konvertierungslogik
│   │   ├── ui.js                 # Theme & Locale
│   │   └── toast.js              # Toast-Benachrichtigungen
│   ├── i18n/                     # Internationalisierung
│   │   └── index.js              # DE/EN Übersetzungen
│   ├── App.vue                   # Root-Komponente
│   ├── main.js                   # App-Initialisierung
│   ├── config.js                 # API Base URL
│   └── style.css                 # Globale Styles
│
├── backend/                      # PHP Backend
│   ├── api/                      # REST API Endpoints
│   │   ├── upload.php            # Datei-Upload Handler
│   │   ├── convert.php           # Konvertierung starten
│   │   ├── status.php            # Fortschritt abfragen
│   │   ├── download.php          # Datei herunterladen
│   │   └── .htaccess             # URL-Rewriting
│   ├── config.php                # Backend-Konfiguration
│   ├── security.php              # Sicherheitsfunktionen
│   ├── queue.php                 # Warteschlangen-Klasse
│   ├── worker.php                # Hintergrund-Worker
│   ├── cleanup.php               # Session-Bereinigung
│   ├── queue.db                  # SQLite-Datenbank
│   └── temp/                     # Temporäre Dateien
│
├── package.json                  # Node-Abhängigkeiten
├── vite.config.js                # Vite-Konfiguration
├── tailwind.config.js            # Tailwind-Theme
├── postcss.config.js             # PostCSS-Konfiguration
├── index.html                    # HTML-Einstiegspunkt
└── README.md                     # Projekt-Dokumentation
```

---

## API-Endpunkte

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/upload` | POST | Dateien hochladen, Session erstellen |
| `/api/convert` | POST | Konvertierung starten |
| `/api/status/{session_id}` | GET | Fortschritt abfragen |
| `/api/download/{session_id}` | GET | Konvertierte Datei herunterladen |

### Upload-Ablauf

1. Dateien werden mit Reihenfolge-Information hochgeladen
2. Session-ID wird generiert (32-Zeichen Hex)
3. Dateien werden in `backend/temp/{session_id}/` gespeichert
4. FFmpeg concat-Datei wird erstellt

### Konvertierungs-Ablauf

- **Direktmodus**: FFmpeg startet sofort
- **Warteschlangen-Modus**: Job wird in SQLite-Queue eingereiht
- Status-Polling alle 1 Sekunde
- Fortschritt wird aus FFmpeg-Log berechnet

---

## State Management (Pinia Stores)

### `converter.js` - Hauptanwendungsstatus

- Dateilisten-Verwaltung (hinzufügen, entfernen, neu ordnen)
- Upload/Konvertierungs-Fortschritt
- Ausgabeformat und Bitrate-Auswahl
- Session-ID und Download-URL
- Fehlerbehandlung
- Smooth Progress Animation (Upload 0-30%, Konvertierung 30-100%)

### `ui.js` - UI-Status

- Theme (hell/dunkel) mit localStorage-Persistenz
- Sprache (de/en) mit localStorage-Persistenz

### `toast.js` - Benachrichtigungssystem

- Success, Error, Info, Warning Toasts
- Auto-Dismiss-Funktionalität

---

## Sicherheitsfunktionen

Das Backend implementiert umfassende Sicherheitsmaßnahmen in `security.php`:

- **Session-ID-Validierung**: Nur 32-Zeichen Hex erlaubt
- **PID-Validierung**: Bereich 0-4194304
- **Extension-Whitelist**: webm, mp3, ogg
- **Bitrate-Whitelist**: 64, 128, 192, 256, 320
- **Dateinamen-Sanitisierung**: Entfernt unsichere Zeichen
- **Path-Traversal-Schutz**: `realpath`-Prüfungen
- **MIME-Type-Validierung**: Bei Uploads

### HTTP-Sicherheitsheader

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cache-Control: no-store, no-cache, must-revalidate`

### Limits

- Max. Dateigröße pro Upload: 100MB
- Max. Dateien pro Upload: 50
- Max. Playlist-Größe: 1GB
- Erlaubte Formate: MP3/WAV

---

## Konfiguration

### `vite.config.js`

- Base Path: `/playlistkonverter/`
- Dev-Server Proxy: `/api` → `localhost:3008`
- Output-Verzeichnis: `dist/`

### `backend/config.php`

- Queue-System Toggle: `use_queue: false/true`
- Max. gleichzeitige Jobs: 3
- Session-Cleanup-Alter: 1 Stunde
- Ausgabeformate mit max. Bitraten

### `tailwind.config.js`

Benutzerdefinierte Farbpalette:
- **Accent**: `#F2E28E` (Goldgelb)
- **Secondary**: `#A28680` (Gedämpftes Braun)
- **Muted**: `#5E5F69` (Dunkelgrau)
- **Neutral**: `#AEAFB7` (Hellgrau)
- **Dark**: `#0C0C10` (Fast Schwarz)

---

## Entwicklung

### Installation

```bash
npm install
```

### Entwicklungsserver starten

```bash
npm run dev
```

Der Dev-Server läuft mit API-Proxy zu `localhost:3008`.

### Produktions-Build

```bash
npm run build
```

Erstellt optimierte Dateien im `dist/`-Verzeichnis.

---

## Deployment

### Server-Anforderungen

- PHP 8.3 mit FPM
- Nginx mit Rewrite-Regeln
- FFmpeg + ffprobe installiert
- Min. 512MB RAM
- Max. Upload: 1GB (konfigurierbar)

### Nginx-Konfiguration (Beispiel)

```nginx
location /playlistkonverter/ {
    alias /path/to/dist/;
}

location /playlistkonverter/api/ {
    fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
}
```

### Warteschlangen-System

Für hohe Last kann das Queue-System aktiviert werden:

```php
// backend/config.php
'use_queue' => true
```

Cronjob für Worker (jede Minute):
```bash
* * * * * php /path/to/backend/worker.php
```

### Cleanup-Cronjob

```bash
*/15 * * * * php /path/to/backend/cleanup.php
```

---

## Internationalisierung

Unterstützte Sprachen:
- **Deutsch (de)** - Standard
- **Englisch (en)**

Übersetzungen befinden sich in `src/i18n/index.js`.

---

## Wichtige Hinweise

### Dateibereinigung

- Dateien werden nach Download automatisch gelöscht
- Session-Verzeichnisse werden nach 1 Stunde bereinigt
- `cleanup.php` sollte regelmäßig per Cronjob ausgeführt werden

### Browser-Kompatibilität

- Moderne Browser erforderlich (ES2015+)
- Drag & Drop-Unterstützung benötigt
- File API-Unterstützung benötigt

### Performance

- Smooth Progress Bar mit mathematischer Interpolation
- Upload-Geschwindigkeitsberechnung in Bytes/Sekunde
- Zeitschätzung: verbleibende_bytes / aktuelle_geschwindigkeit
- Backend-Fortschritt aus FFmpeg-Logs geparst
