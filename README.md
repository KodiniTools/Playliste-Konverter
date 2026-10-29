# Playlist Konverter

Web-Tool zum Zusammenfügen mehrerer MP3/WAV-Tracks zu einer Datei (MP3, WebM/Opus
oder OGG/Vorbis), live unter <https://kodinitools.com/playlistkonverter/>.

## Features

- Upload per Drag & Drop, Datei- oder Ordnerauswahl und Einfügen aus der Zwischenablage
- Track-Reihenfolge per Drag & Drop, Vorschau über einen Sticky-Player
- Ausgabe als MP3, WebM (Opus) oder OGG (Vorbis), 64–320 kbps
- Fortschrittsanzeige für Upload und Konvertierung, Abbrechen jederzeit
- Gestaffelte Größenwarnungen bis zum Limit von 5 GB pro Playlist
- Weitergabe der fertigen Datei an den Ultimativen Musikplayer (gemeinsame IndexedDB)
- Deutsch/Englisch, Hell/Dunkel (gesteuert von der KodiniTools-Navigation)

## Tech-Stack

### Frontend

- Vue 3 (Composition API, `<script setup>`), Pinia, vue-i18n
- Tailwind CSS auf den KodiniTools-Tokens v2 (`--ds-*`, siehe `src/design-system/README.md`)
- Axios, Vite, Vitest + Vue Test Utils, ESLint + Prettier

### Server (`server/`)

- Node.js + Express, multer, ffmpeg/ffprobe
- Läuft dauerhaft unter pm2 (`playlistkonverter-server`) auf `127.0.0.1:9016`,
  öffentlich nur über den nginx-Proxy `/playlistkonverter/api/`
- Details zu Pipeline, API und Umgebungsvariablen: [`server/README.md`](server/README.md)

## Development

Voraussetzung: Node.js 20.19+ oder 22.12+ (Vite 8), auch auf dem Server, auf dem `deploy.sh` baut.

```bash
npm install
npm --prefix server install

npm run dev            # Vite-Dev-Server
npm test               # App-Tests (Vitest)
npm run test:server    # Server-Tests (node --test)
npm run build
npm run lint
npm run format:check
```

Der Vite-Proxy leitet `/api` an `localhost:3008` weiter. Für lokale Tests mit
echtem Server den Dienst auf diesem Port starten (ffmpeg/ffprobe im `PATH`):

```bash
PORT=3008 npm --prefix server start
```

## Dateistruktur

```
Playliste-Konverter/
├── index.html, faq.html, funktion.html   # Statische Seiten (Landing, FAQ, Anleitung)
├── app.html                              # Einstieg der Vue-App
├── src/
│   ├── api/converter.js                  # Upload, Convert, Status, Download-URL
│   ├── components/                       # Vue-Komponenten
│   ├── stores/                           # converter, player, toast, ui (Pinia)
│   ├── design-system/                    # Tokens v2 (CSS/JSON/JS)
│   ├── i18n/                             # DE/EN-Texte
│   ├── landing/, styles/                 # CSS der statischen Seiten und Grundlage
│   ├── utils/                            # Format, localStorage, geteilte IndexedDB
│   └── tests/                            # Vitest-Specs
├── server/                               # Node-Konvertierungsdienst + Tests
├── deploy/nginx-playlistkonverter.conf   # nginx-Abschnitt für kodinitools.com
├── deploy.sh                             # Deploy auf dem Server aus origin/main
└── DEPLOY.md                             # Deploy- und Betriebsanleitung
```

## Deployment

Auf dem Server im Git-Checkout (nicht im Webroot):

```bash
cd /opt/playliste-konverter
./deploy.sh
```

`deploy.sh` setzt auf `origin/main` zurück, baut das Frontend, synchronisiert
`dist/` in den Webroot, lädt den Node-Dienst per pm2 neu und testet/lädt nginx.
Einmalige Einrichtung, Einzelschritte, Variablen und Diagnose: [`DEPLOY.md`](DEPLOY.md).

## Limits

| Limit                   | Wert   | Durchgesetzt in                                 |
| ----------------------- | ------ | ----------------------------------------------- |
| Größe pro Playlist      | 5 GB   | App (`src/constants.js`) und Server (413)       |
| Größe pro Datei         | 500 MB | Server (413)                                    |
| Freie Platzreserve      | 20 GB  | Server (507 bei Unterschreitung)                |
| Parallele Konvertierung | 3      | Server (weitere Jobs warten in der Queue)       |
| Eingabeformate          | MP3, WAV | App und Server                                |

## Troubleshooting

- Dienst-Status und Logs: `pm2 list`, `pm2 logs playlistkonverter-server`
- Health-Check: `curl -s http://127.0.0.1:9016/health`
- ffmpeg prüfen: `ffmpeg -version`
- nginx: `nginx -t`, `tail -f /var/log/nginx/error.log`

## License

MIT License

## Autor

Dinko Ramić, Kodini Tools, kodinitools.com
