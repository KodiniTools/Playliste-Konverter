# Context.md - Playliste-Konverter

## Projektübersicht

**Playliste-Konverter** ist eine Full-Stack-Webanwendung zum Zusammenfügen mehrerer Audio-Dateien (MP3/WAV) zu einer einzelnen Ausgabedatei. Die Anwendung bietet eine moderne, benutzerfreundliche Oberfläche mit Drag & Drop-Unterstützung und Echtzeit-Fortschrittsanzeige.

### Hauptfunktionen

- Multi-Datei-Upload mit Drag & Drop
- Track-Neuordnung per Drag & Drop
- Audio-Vorschau für einzelne Tracks mit Fortschrittsanzeige
- Mehrere Ausgabeformate: WebM (Opus), MP3, OGG (Vorbis)
- Konfigurierbare Audio-Qualität (64-320 kbps)
- Echtzeit-Fortschrittsanzeige mit Upload-Geschwindigkeit und Zeitschätzung
- Gestaffelte Größenwarnungen mit Zeitschätzungen
- Optionales Warteschlangen-System für hohe Last
- Automatische Bereinigung temporärer Dateien
- Zweisprachige Oberfläche (Deutsch/Englisch)
- Dark Mode-Unterstützung
- File System Access API für modernen Download-Dialog
- LocalStorage-Persistierung für Einstellungen

---

## Benutzeranleitung für Erstbenutzer

### Schnellstart in 5 Schritten

1. **App öffnen** → Besuche die Landing-Page und klicke auf "App starten"
2. **Dateien hochladen** → Ziehe MP3/WAV-Dateien in den Upload-Bereich
3. **Reihenfolge anpassen** → Ziehe Tracks in die gewünschte Reihenfolge
4. **Format wählen** → Wähle Ausgabeformat und Qualität
5. **Konvertieren & Download** → Klicke "Konvertieren" und lade die Datei herunter

---

### Schritt-für-Schritt Anleitung

#### 1. Die App starten

Öffne die Anwendung im Browser. Du landest auf der **Landing-Page**, die dir einen Überblick über alle Funktionen gibt. Klicke auf den Button **"App starten"** oder **"Jetzt ausprobieren"**, um zur Konverter-Anwendung zu gelangen.

> **Tipp:** Die App funktioniert am besten in modernen Browsern wie Chrome, Firefox, Edge oder Safari.

#### 2. Audio-Dateien hochladen

Es gibt zwei Möglichkeiten, Dateien hinzuzufügen:

**Option A: Drag & Drop (empfohlen)**
- Öffne den Datei-Explorer deines Computers
- Wähle die gewünschten MP3- oder WAV-Dateien aus
- Ziehe sie direkt in den markierten Upload-Bereich
- Lasse die Maustaste los

**Option B: Datei-Auswahl**
- Klicke auf den Button **"Dateien auswählen"**
- Navigiere zu deinen Audio-Dateien
- Wähle eine oder mehrere Dateien aus
- Bestätige mit "Öffnen"

**Unterstützte Formate:**
- MP3 (.mp3)
- WAV (.wav)

**Limits:**
- Maximale Dateigröße pro Datei: 100 MB
- Maximale Anzahl Dateien: 50
- Maximale Gesamtgröße: 1 GB

> **Hinweis:** Nach dem Hochladen erscheint eine Bestätigung: "X Dateien hinzugefügt"

#### 3. Die Playlist verwalten

Nach dem Upload siehst du deine Dateien in einer Liste:

**Reihenfolge ändern:**
- Klicke auf einen Track und halte die Maustaste gedrückt
- Ziehe den Track an die gewünschte Position
- Lasse los – die neue Reihenfolge wird sofort übernommen

**Audio-Vorschau:**
- Klicke auf den **Play-Button** (▶) neben einem Track
- Die Musik wird im Browser abgespielt
- Ein Fortschrittsbalken zeigt die aktuelle Position
- Klicke erneut zum Pausieren (⏸)

**Dateien entfernen:**
- Einzelne Datei: Klicke auf das **X** neben dem Track
- Alle Dateien: Klicke auf **"Alle entfernen"**

#### 4. Größenwarnungen verstehen

Die App zeigt dir automatisch Warnungen basierend auf der Gesamtgröße:

| Farbe | Größe | Bedeutung |
|-------|-------|-----------|
| 🟢 Grün | < 500 MB | Alles OK – schnelle Konvertierung |
| 🟡 Gelb | 500-800 MB | Größere Playlist – ca. 3-5 Minuten Wartezeit |
| 🟠 Orange | 800 MB - 1 GB | Sehr große Playlist – ca. 5-7 Minuten Wartezeit |
| 🔴 Rot | > 1 GB | Zu groß – bitte Dateien entfernen |

> **Wichtig:** Bei roter Warnung ist der Konvertieren-Button deaktiviert. Entferne Dateien, um unter das Limit zu kommen.

#### 5. Ausgabeformat und Qualität wählen

**Format auswählen:**

| Format | Codec | Beschreibung | Empfohlen für |
|--------|-------|--------------|---------------|
| **WebM** | Opus | Modernes Format, beste Qualität bei kleiner Größe | Web, moderne Player |
| **MP3** | LAME | Universell kompatibel | Alle Geräte |
| **OGG** | Vorbis | Open-Source Alternative | Linux, Open-Source |

**Bitrate (Qualität) wählen:**

| Bitrate | Qualität | Dateigröße | Empfohlen für |
|---------|----------|------------|---------------|
| 64 kbps | Niedrig | Sehr klein | Sprache, Podcasts |
| 128 kbps | Standard | Klein | Allgemeine Nutzung |
| 192 kbps | Gut | Mittel | Musik-Streaming |
| 256 kbps | Hoch | Größer | Hochwertige Musik |
| 320 kbps | Maximum | Groß | Audiophile Qualität |

> **Tipp:** Für die meisten Anwendungsfälle ist 128-192 kbps eine gute Wahl. Höhere Bitraten lohnen sich nur bei hochwertigen Quell-Dateien.

#### 6. Konvertierung starten

1. Überprüfe deine Playlist und Einstellungen
2. Klicke auf den Button **"X Track(s) konvertieren"**
3. Die Konvertierung startet automatisch

**Was passiert während der Konvertierung:**

- **Upload (0-30%)**: Deine Dateien werden hochgeladen
  - Zeigt Upload-Geschwindigkeit (z.B. "2.5 MB/s")
  - Zeigt geschätzte Restzeit

- **Konvertierung (30-100%)**: Server fügt Dateien zusammen
  - Fortschrittsbalken bewegt sich gleichmäßig
  - Bei großen Dateien kann dies einige Minuten dauern

**Konvertierung abbrechen:**
- Klicke jederzeit auf **"Abbrechen"**
- Die App kehrt zum Ausgangszustand zurück

#### 7. Datei herunterladen

Nach erfolgreicher Konvertierung:

1. Ein **grüner Erfolgs-Hinweis** erscheint
2. Die **Dateigröße** der konvertierten Datei wird angezeigt
3. Klicke auf **"Download"**

**Download-Optionen:**

- **Moderne Browser (Chrome, Edge)**: Es öffnet sich ein "Speichern unter"-Dialog
- **Andere Browser**: Die Datei wird direkt heruntergeladen

> **Hinweis:** Nach dem Download wird die Datei automatisch vom Server gelöscht.

#### 8. Einstellungen anpassen

Oben rechts findest du zwei Buttons:

**Theme wechseln (☀/🌙):**
- Klicke auf das Sonnen- oder Mond-Symbol
- Wechselt zwischen hellem und dunklem Modus
- Deine Präferenz wird gespeichert

**Sprache wechseln (DE/EN):**
- Klicke auf das Sprach-Symbol
- Wechselt zwischen Deutsch und Englisch
- Deine Präferenz wird gespeichert

---

### Häufige Fragen beim ersten Mal

**"Warum kann ich nicht konvertieren?"**
- Prüfe die Größenwarnung – ist sie rot?
- Sind überhaupt Dateien hochgeladen?
- Sind die Dateien im richtigen Format (MP3/WAV)?

**"Warum dauert es so lange?"**
- Große Playlists (>500 MB) benötigen mehr Zeit
- Die Konvertierungszeit hängt von der Gesamtgröße ab
- Bei langsamer Internetverbindung dauert der Upload länger

**"Wo finde ich meine Datei?"**
- Prüfe deinen Download-Ordner
- Bei "Speichern unter" hast du den Speicherort selbst gewählt

**"Kann ich die gleiche Playlist nochmal konvertieren?"**
- Klicke auf **"Neue Konvertierung starten"**
- Lade die Dateien erneut hoch

**"Werden meine Dateien gespeichert?"**
- Nein! Alle Dateien werden nach dem Download automatisch gelöscht
- Deine Dateien werden nicht dauerhaft auf dem Server gespeichert

---

### Tipps für beste Ergebnisse

1. **Qualität der Quelldateien**: Verwende hochwertige Ausgangsdateien – die Konvertierung kann Qualität nicht verbessern
2. **Einheitliche Qualität**: Mische keine sehr unterschiedlichen Qualitätsstufen
3. **Reihenfolge prüfen**: Nutze die Vorschau, um die richtige Reihenfolge sicherzustellen
4. **Format passend wählen**: WebM für Web, MP3 für maximale Kompatibilität
5. **Stabile Verbindung**: Nutze eine stabile Internetverbindung für große Uploads

---

## Seiten & Routes

### Landing-Page (`index.html`)

Die Startseite präsentiert die Anwendung mit:

- **Hero-Section**: Überschrift, Beschreibung und Call-to-Action Buttons
- **Features-Section**: 7 Feature-Karten (Drag & Drop, Reihenfolge, Vorschau, Datenschutz, Echtzeit-Fortschritt, Mehrere Formate)
- **How-It-Works**: 3-Schritte-Anleitung
- **Formate-Section**: Vorstellung der Ausgabeformate (WebM, MP3, OGG)
- **CTA-Section**: Direkter Zugriff zur App
- Responsive Design mit Animationen und Gradient-Effekten

### App-Seite (`app.html`)

Die Haupt-Anwendung als Vue 3 Single Page Application mit:

- Vollständiger Konverter-Funktionalität
- Alle Vue-Komponenten integriert
- Theme- und Spracheinstellungen

### FAQ-Seite (`faq.html`)

Separate Seite mit häufig gestellten Fragen:

- Umfangreiche Q&A-Sammlung
- Gleiches Design-System wie Landing-Page
- Navigation zurück zur App
- Mehrsprachig unterstützt (DE/EN)

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
├── index.html                    # Landing-Page (statisch)
├── app.html                      # Vue App-Einstiegspunkt
├── faq.html                      # FAQ-Seite (statisch)
│
├── src/                          # Vue 3 Frontend
│   ├── components/               # Vue-Komponenten
│   │   ├── FileUploader.vue      # Drag & Drop Upload
│   │   ├── FileList.vue          # Playlist-Verwaltung mit Audio-Vorschau
│   │   ├── FormatSelector.vue    # Format/Bitrate-Auswahl
│   │   ├── ConversionProgress.vue # Fortschrittsanzeige mit Zeitschätzung
│   │   ├── DownloadButton.vue    # Datei-Download mit File System API
│   │   ├── SizeWarning.vue       # Gestaffelte Größenwarnungen
│   │   ├── SettingsSwitcher.vue  # Theme/Sprache-Umschalter
│   │   └── ToastContainer.vue    # Benachrichtigungen
│   ├── stores/                   # Pinia State Management
│   │   ├── converter.js          # Haupt-Konvertierungslogik
│   │   ├── ui.js                 # Theme & Locale mit LocalStorage
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
└── README.md                     # Projekt-Dokumentation
```

---

## UI-Komponenten (Detail)

### FileUploader.vue
- Drag-and-Drop Zone für Audio-Dateien
- Alternativ: Datei-Auswahl via Button
- Unterstützte Formate: MP3, WAV
- Visuelles Feedback beim Hovern (Border-Highlight)

### FileList.vue
- Playlist-Anzeige mit Track-Nummern
- Größen-Anzeige pro Track und Gesamtgröße
- **Audio-Vorschau**: Play/Pause Buttons mit Fortschrittsbalken
- Fortschrittsanzeige zeigt aktuelle Position in Sekunden
- Drag-and-Drop zum Umsortieren von Tracks
- Einzelne Datei entfernen oder alle auf einmal löschen
- Maximale Scroll-Höhe mit Overflow

### FormatSelector.vue
- Format-Auswahl: WebM (Opus), MP3, OGG (Vorbis)
- Bitrate-Auswahl: 64, 128, 192, 256, 320 kbps
- Format-spezifische Bitrate-Limits
- Beschreibungen und Hinweise zur Audioqualität
- Visuelle Selektions-Indikatoren

### SizeWarning.vue
Gestaffelte Warnungen basierend auf Dateigröße:
- **Grün** (< 500 MB): Alles OK
- **Gelb** (500-800 MB): Größere Playlist, 3-5 Minuten Wartezeit
- **Orange** (800 MB - 1 GB): Sehr große Playlist, 5-7 Minuten Wartezeit
- **Rot** (> 1 GB): Zu groß, Konvertierung deaktiviert

### ConversionProgress.vue
- Kombinierter Progress-Bar (Upload + Konvertierung)
- Upload: 0-30% der Anzeige
- Konvertierung: 30-100% der Anzeige
- Prozentuale Fortschrittsanzeige
- Upload-Geschwindigkeit (KB/s oder MB/s)
- Geschätzte Restzeit
- Abbrechen-Button mit Loading-Status

### DownloadButton.vue
- Success-Anzeige mit Checkmark-Icon
- Dateigrößen-Anzeige der konvertierten Datei
- **File System Access API**: Speichern-Dialog für moderne Browser
- Fallback für ältere Browser: Direkter Download
- Link zum Starten einer neuen Konvertierung

### ToastContainer.vue
- Toast-Benachrichtigungen: Success, Error, Info, Warning
- Auto-Dismiss nach konfigurierbarer Zeit
- Slide-in/Slide-out Animationen
- Manuelle Dismiss-Option
- Farbcodiert nach Nachrichtentyp

### SettingsSwitcher.vue
- Theme Toggle: Light/Dark Mode
- Sprach-Switch: Deutsch ↔ Englisch
- Icon-basierte Buttons
- Einstellungen werden in LocalStorage gespeichert

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

---

## Benutzer-Workflows

### Workflow 1: Audio-Dateien konvertieren

1. Datei(en) hochladen via Drag-Drop oder Datei-Auswahl
2. Toast-Bestätigung: "X Dateien hinzugefügt"
3. Playlist wird angezeigt mit Größen-Warnung
4. Optional: Audio-Vorschau spielen (Play-Button)
5. Format und Bitrate auswählen
6. "N Track(s) konvertieren" Button klicken
7. Upload-Progress mit Geschwindigkeit und Restzeit
8. Konvertierungs-Progress mit flüssiger Animation
9. Dateigrößen-Anzeige nach Fertigstellung
10. Download-Dialog oder direkter Download

### Workflow 2: Track-Reihenfolge ändern

1. In Playlist auf Track klicken und halten
2. Zu gewünschter Position ziehen
3. Track springt sofort an neue Position
4. Neue Reihenfolge wird für Konvertierung verwendet

### Workflow 3: Audio-Vorschau

1. Play-Button auf Playlist-Item klicken
2. Player startet und zeigt aktuellen Progress
3. Musik spielt im Browser
4. Fortschrittsbalken zeigt Position in Sekunden
5. Pause-Button stoppt die Wiedergabe

### Workflow 4: Größen-Management

1. Dateien hinzufügen
2. System prüft Gesamtgröße kontinuierlich
3. Entsprechende Warnung wird angezeigt:
   - Grün: Alles OK
   - Gelb: Große Datei (3-5 min Wartezeit)
   - Orange: Sehr große Datei (5-7 min Wartezeit)
   - Rot: Zu groß (Button deaktiviert)
4. Dateien entfernen, um Limit zu unterschreiten

### Workflow 5: Theme & Sprache wechseln

1. Settings-Buttons in Kopfzeile nutzen
2. Sprache wechseln: DE ↔ EN
3. Theme wechseln: Light ↔ Dark
4. Einstellungen werden in LocalStorage gespeichert
5. Beim nächsten Besuch automatisch wiederhergestellt

### Workflow 6: Konvertierung abbrechen

1. Während Upload/Konvertierung: "Abbrechen" klicken
2. Button zeigt "Wird abgebrochen..."
3. Alle Requests werden abgebrochen
4. Toast: "Vorgang abgebrochen"
5. Rückkehr zum Anfangszustand

---

## Technische Highlights

### LocalStorage-Persistierung

Folgende Einstellungen werden im Browser gespeichert:
- **Theme**: Light/Dark Mode Präferenz
- **Locale**: Sprach-Einstellung (de/en)
- **Output-Format**: Zuletzt gewähltes Format
- **Bitrate**: Zuletzt gewählte Bitrate

### File System Access API

- Moderner Download-Dialog für unterstützte Browser
- "Speichern unter"-Funktionalität
- Automatischer Fallback für ältere Browser

### Progress-Berechnung

- **Upload-Phase** (0-30%): Basierend auf übertragenen Bytes
- **Konvertierungs-Phase** (30-100%): Basierend auf FFmpeg-Log
- Simulierte flüssige Animation für bessere UX
- Keine hackigen Sprünge im Fortschrittsbalken

### Session-Management

- Session-ID: 32-Zeichen Hex-String
- Temporäre Dateien in `backend/temp/{session_id}/`
- Automatische Bereinigung nach Download
- Cronjob-basierte Bereinigung alter Sessions (1 Stunde)

### FFmpeg-Integration

- Concat-Demuxer für nahtloses Zusammenfügen
- Codec-Auswahl basierend auf Ausgabeformat:
  - WebM → libopus
  - MP3 → libmp3lame
  - OGG → libvorbis
- Hintergrund-Ausführung mit PID-Tracking
- Fortschritts-Parsing aus Log-Dateien
