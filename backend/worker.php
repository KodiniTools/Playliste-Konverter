#!/usr/bin/env php
<?php
/**
 * Queue Worker
 *
 * Arbeitet die Konvertierungs-Queue ab.
 * Max. 3 gleichzeitige Konvertierungen.
 *
 * Als Systemd-Service oder via Cronjob starten:
 * */1 * * * * /usr/bin/php /var/www/kodinitools.com/playlistkonverter/backend/worker.php
 */

require_once __DIR__ . '/queue.php';

// Konfiguration
define('MAX_CONCURRENT_JOBS', 3); // Maximal 3 gleichzeitige Konvertierungen
define('WORKER_SLEEP', 5);         // 5 Sekunden zwischen Checks
define('MAX_RUNTIME', 300);        // 5 Minuten max. Laufzeit

$queue = new ConversionQueue();
$startTime = time();

echo "=== Queue Worker gestartet ===\n";
echo "Max gleichzeitige Jobs: " . MAX_CONCURRENT_JOBS . "\n";
echo "Worker Sleep: " . WORKER_SLEEP . " Sekunden\n\n";

// Hauptschleife
while (true) {
    // Prüfe ob Worker zu lange läuft (für Cronjob-Modus)
    if (time() - $startTime > MAX_RUNTIME) {
        echo "Max. Laufzeit erreicht. Worker beendet.\n";
        break;
    }

    // Zähle aktive Jobs
    $stats = $queue->getStats();
    $activeJobs = $stats['pending'] + $stats['processing'];

    echo "[" . date('H:i:s') . "] Stats: {$stats['pending']} pending, {$stats['processing']} processing, {$stats['completed']} completed, {$stats['failed']} failed\n";

    // Wenn zu viele Jobs laufen, warte
    if ($stats['processing'] >= MAX_CONCURRENT_JOBS) {
        echo "→ Max. Jobs erreicht. Warte...\n";
        sleep(WORKER_SLEEP);
        continue;
    }

    // Keine Jobs mehr? Beende Worker (für Cronjob-Modus)
    if ($activeJobs == 0) {
        echo "→ Keine Jobs in Queue. Worker beendet.\n";
        break;
    }

    // Hole nächsten Job
    $sessionId = $queue->getNextJob();

    if (!$sessionId) {
        echo "→ Kein Job verfügbar. Warte...\n";
        sleep(WORKER_SLEEP);
        continue;
    }

    echo "→ Starte Job: $sessionId\n";

    // Markiere als "in Bearbeitung"
    $queue->markAsProcessing($sessionId);

    // Starte Konvertierung
    $success = startConversion($sessionId);

    if ($success) {
        echo "✓ Job erfolgreich: $sessionId\n";
        $queue->markAsCompleted($sessionId);
    } else {
        echo "✗ Job fehlgeschlagen: $sessionId\n";
        $queue->markAsFailed($sessionId, 'Konvertierung fehlgeschlagen');
    }

    // Kurze Pause
    sleep(1);
}

// Cleanup alte Jobs
$deleted = $queue->cleanupOldJobs(3600); // Jobs älter als 1 Stunde
if ($deleted > 0) {
    echo "\nCleanup: $deleted alte Jobs gelöscht\n";
}

echo "\n=== Queue Worker beendet ===\n";

/**
 * Startet die Konvertierung für eine Session
 */
function startConversion($sessionId) {
    $sessionDir = __DIR__ . '/temp/' . $sessionId . '/';
    $metaFile = $sessionDir . 'meta.json';

    if (!file_exists($metaFile)) {
        echo "  ✗ Meta-Datei nicht gefunden\n";
        return false;
    }

    $meta = json_decode(file_get_contents($metaFile), true);

    // Update status
    $meta['status'] = 'converting';
    $meta['progress'] = 0;
    file_put_contents($metaFile, json_encode($meta));

    // Start FFmpeg
    $concatFile = $sessionDir . 'concat.txt';
    $outputFile = $sessionDir . 'playlist.webm';
    $logFile = $sessionDir . 'ffmpeg.log';

    $cmd = sprintf(
        'ffmpeg -f concat -safe 0 -i %s -c:a libopus -b:a 128k -threads 4 -y %s > %s 2>&1',
        escapeshellarg($concatFile),
        escapeshellarg($outputFile),
        escapeshellarg($logFile)
    );

    echo "  → FFmpeg läuft...\n";

    // Führe FFmpeg aus und warte auf Abschluss
    exec($cmd, $output, $returnCode);

    if ($returnCode === 0 && file_exists($outputFile)) {
        // Erfolg
        $meta['status'] = 'done';
        $meta['progress'] = 100;
        $meta['file_size'] = filesize($outputFile);
        file_put_contents($metaFile, json_encode($meta));

        $sizeMB = round($meta['file_size'] / 1024 / 1024, 2);
        echo "  ✓ Konvertierung abgeschlossen ({$sizeMB} MB)\n";

        return true;
    } else {
        // Fehler
        $meta['status'] = 'error';
        $meta['error'] = 'FFmpeg Fehler - Return Code: ' . $returnCode;
        file_put_contents($metaFile, json_encode($meta));

        echo "  ✗ FFmpeg Fehler (Return Code: $returnCode)\n";

        return false;
    }
}
