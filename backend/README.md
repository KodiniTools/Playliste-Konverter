# Backend - Queue-System & Cleanup

Dieses Backend unterstützt zwei Modi für die Konvertierung:

1. **Direkter Modus** (Standard) - Konvertierungen laufen sofort
2. **Queue-Modus** - Konvertierungen werden in Warteschlange eingereiht

## Konfiguration

Bearbeiten Sie `backend/config.php`:

```php
return [
    'use_queue' => false,  // false = Direkt, true = Queue
    'max_concurrent_jobs' => 3,  // Max. gleichzeitige Konvertierungen
    'cleanup_max_age' => 3600,   // Session-Alter in Sekunden (1 Stunde)
];
```

---

## 1. Cleanup-Cronjob (WICHTIG!)

Löscht alte Session-Ordner automatisch.

### Installation

**Auf Ihrem Server:**

```bash
# Mache cleanup.php ausführbar
chmod +x /var/www/kodinitools.com/playlistkonverter/backend/cleanup.php

# Cronjob hinzufügen (alle 15 Minuten)
crontab -e
```

**Fügen Sie diese Zeile hinzu:**
```cron
*/15 * * * * /usr/bin/php /var/www/kodinitools.com/playlistkonverter/backend/cleanup.php >> /var/log/playlist-cleanup.log 2>&1
```

### Manuell ausführen

```bash
cd /var/www/kodinitools.com/playlistkonverter/backend
php cleanup.php
```

### Ausgabe

```
✓ Gelöscht: a1b2c3d4e5f6... (Alter: 125 Minuten)
✓ Gelöscht: f6e5d4c3b2a1... (Alter: 87 Minuten)

=== Cleanup abgeschlossen ===
Sessions gelöscht: 2
Fehler: 0
Verbleibende Sessions: 3
```

---

## 2. Queue-System

Für viele gleichzeitige Nutzer (10+).

### Vorteile

- Max. 3 gleichzeitige Konvertierungen (konfigurierbar)
- Verhindert Server-Überlastung
- Nutzer sehen ihre Position in der Queue
- Fairness durch FIFO (First In, First Out)

### Aktivierung

**1. Config anpassen:**

```php
// backend/config.php
return [
    'use_queue' => true,  // Queue aktivieren
    'max_concurrent_jobs' => 3,
];
```

**2. Worker starten:**

**Option A: Als Cronjob (einfach)**
```bash
crontab -e
```

Fügen Sie hinzu (läuft jede Minute):
```cron
*/1 * * * * /usr/bin/php /var/www/kodinitools.com/playlistkonverter/backend/worker.php >> /var/log/playlist-worker.log 2>&1
```

**Option B: Als Systemd-Service (fortgeschritten)**

Erstellen Sie `/etc/systemd/system/playlist-worker.service`:
```ini
[Unit]
Description=Playlist Queue Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/kodinitools.com/playlistkonverter/backend
ExecStart=/usr/bin/php /var/www/kodinitools.com/playlistkonverter/backend/worker.php
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Dann:
```bash
sudo systemctl daemon-reload
sudo systemctl enable playlist-worker
sudo systemctl start playlist-worker
sudo systemctl status playlist-worker
```

### Worker-Ausgabe

```
=== Queue Worker gestartet ===
Max gleichzeitige Jobs: 3

[14:23:45] Stats: 5 pending, 2 processing, 128 completed, 1 failed
→ Max. Jobs erreicht. Warte...

[14:23:50] Stats: 4 pending, 2 processing, 129 completed, 1 failed
→ Starte Job: abc123...
  → FFmpeg läuft...
  ✓ Konvertierung abgeschlossen (45.23 MB)
✓ Job erfolgreich: abc123...

Cleanup: 15 alte Jobs gelöscht
=== Queue Worker beendet ===
```

### Queue-Datenbank

- Speicherort: `backend/queue.db` (SQLite)
- Wird automatisch erstellt
- Kein manuelles Setup nötig

---

## Vergleich: Direkt vs. Queue

| Feature | Direkter Modus | Queue-Modus |
|---------|---------------|-------------|
| Anzahl Nutzer | 1-5 | 10+ |
| Setup | Keine Änderung nötig | Worker muss laufen |
| Server-Last | Kann hoch werden | Kontrolliert |
| Wartezeit | Sofort | Warteschlange |
| Beste für | Kleine Websites | Viele Nutzer |

---

## Troubleshooting

### Cleanup läuft nicht

```bash
# Prüfe Cronjob
crontab -l

# Prüfe Log
tail -f /var/log/playlist-cleanup.log

# Manuell testen
php /var/www/kodinitools.com/playlistkonverter/backend/cleanup.php
```

### Queue-Worker läuft nicht

```bash
# Prüfe Worker-Log
tail -f /var/log/playlist-worker.log

# Prüfe ob Worker läuft
ps aux | grep worker.php

# Manuell starten (Test)
php /var/www/kodinitools.com/playlistkonverter/backend/worker.php
```

### Queue-Datenbank defekt

```bash
# Lösche und neu erstellen lassen
rm /var/www/kodinitools.com/playlistkonverter/backend/queue.db

# Starte Worker neu (erstellt DB automatisch)
```

### Temp-Ordner voll

```bash
# Manuelles Cleanup
find /var/www/kodinitools.com/playlistkonverter/backend/temp/ -type d -mmin +60 -exec rm -rf {} +
```

---

## Monitoring

### Queue-Statistiken

```bash
# SQL-Abfrage
sqlite3 /var/www/kodinitools.com/playlistkonverter/backend/queue.db "SELECT status, COUNT(*) FROM queue GROUP BY status;"
```

Ausgabe:
```
pending|5
processing|2
completed|128
failed|1
```

### Disk Space

```bash
# Temp-Ordner Größe
du -sh /var/www/kodinitools.com/playlistkonverter/backend/temp/
```

---

## Performance-Empfehlungen

### 1-5 gleichzeitige Nutzer
- ✅ Direkter Modus
- ✅ Cleanup-Cronjob
- ❌ Queue nicht nötig

### 10-20 gleichzeitige Nutzer
- ✅ Queue-Modus aktivieren
- ✅ Worker als Cronjob
- ✅ `max_concurrent_jobs = 3`

### 20+ gleichzeitige Nutzer
- ✅ Queue-Modus
- ✅ Worker als Systemd-Service
- ✅ `max_concurrent_jobs = 5`
- ⚠️ Server-Upgrade nötig (CPU/RAM)

---

## Dateien-Übersicht

```
backend/
├── api/
│   ├── convert.php      # Startet Konvertierung (Queue-aware)
│   ├── status.php       # Status-Abfrage (Queue-aware)
│   ├── upload.php       # Upload (unverändert)
│   └── download.php     # Download (unverändert)
├── cleanup.php          # Session-Cleanup (Cronjob)
├── config.php           # Konfiguration
├── queue.php            # Queue-Manager (Klasse)
├── worker.php           # Queue-Worker
└── README.md            # Diese Datei
```

---

## Support

Bei Problemen:
1. Prüfe Logs: `/var/log/playlist-*.log`
2. Prüfe PHP-Fehlerlog: `/var/log/apache2/error.log`
3. Teste manuell: `php cleanup.php` / `php worker.php`
