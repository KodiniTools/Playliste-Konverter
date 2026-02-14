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
require_once __DIR__ . '/security.php';

// Konfiguration laden
$config = require __DIR__ . '/config.php';

define('MAX_CONCURRENT_JOBS', $config['max_concurrent_jobs'] ?? 3);

define('WORKER_SLEEP', 5);         // 5 Sekunden zwischen Checks
define('MAX_RUNTIME', 300);        // 5 Minuten max. Laufzeit

$queue = new ConversionQueue();
$startTime = time();

fwrite(STDOUT, "=== Queue Worker gestartet ===\n");
fwrite(STDOUT, "Max gleichzeitige Jobs: " . MAX_CONCURRENT_JOBS . "\n");
fwrite(STDOUT, "Worker Sleep: " . WORKER_SLEEP . " Sekunden\n\n");

// Hauptschleife
while (true) {
    // Prüfe ob Worker zu lange läuft (für Cronjob-Modus)
    if (time() - $startTime > MAX_RUNTIME) {
        fwrite(STDOUT, "Max. Laufzeit erreicht. Worker beendet.\n");
        break;
    }

    // Zähle aktive Jobs
    $stats = $queue->getStats();
    $activeJobs = $stats['pending'] + $stats['processing'];

    fwrite(STDOUT, "[" . date('H:i:s') . "] Stats: " . $stats['pending'] . " pending, " . $stats['processing'] . " processing, " . $stats['completed'] . " completed, " . $stats['failed'] . " failed\n");

    // Wenn zu viele Jobs laufen, warte
    if ($stats['processing'] >= MAX_CONCURRENT_JOBS) {
        fwrite(STDOUT, "→ Max. Jobs erreicht. Warte...\n");
        sleep(WORKER_SLEEP);
        continue;
    }

    // Keine Jobs mehr? Beende Worker (für Cronjob-Modus)
    if ($activeJobs === 0) {
        fwrite(STDOUT, "→ Keine Jobs in Queue. Worker beendet.\n");
        break;
    }

    // Hole nächsten Job
    $sessionId = $queue->getNextJob();

    if ($sessionId === false || $sessionId === null) {
        fwrite(STDOUT, "→ Kein Job verfügbar. Warte...\n");
        sleep(WORKER_SLEEP);
        continue;
    }

    fwrite(STDOUT, "→ Starte Job: " . $sessionId . "\n");

    // Markiere als "in Bearbeitung"
    $queue->markAsProcessing($sessionId);

    // Starte Konvertierung
    $success = startConversion($sessionId);

    if ($success === true) {
        fwrite(STDOUT, "✓ Job erfolgreich: " . $sessionId . "\n");
        $queue->markAsCompleted($sessionId);
    } else {
        fwrite(STDERR, "✗ Job fehlgeschlagen: " . $sessionId . "\n");
        $queue->markAsFailed($sessionId, 'Konvertierung fehlgeschlagen');
    }

    // Kurze Pause
    sleep(1);
}

// Cleanup alte Jobs
$deleted = $queue->cleanupOldJobs(3600); // Jobs älter als 1 Stunde
if ($deleted > 0) {
    fwrite(STDOUT, "\nCleanup: " . $deleted . " alte Jobs gelöscht\n");
}

fwrite(STDOUT, "\n=== Queue Worker beendet ===\n");

/**
 * Startet die Konvertierung für eine Session
 */
function startConversion($sessionId) {
    global $config;

    $sessionDir = __DIR__ . '/temp/' . $sessionId . '/';
    $metaFile = $sessionDir . 'meta.json';

    if (file_exists($metaFile) === false) {
        fwrite(STDERR, "  ✗ Meta-Datei nicht gefunden\n");
        return false;
    }

    $meta = json_decode(file_get_contents($metaFile), true);

    // Format und Bitrate aus meta.json lesen (vom User gewählt)
    $outputFormat = $meta['output_format'] ?? $config['default_format'] ?? 'webm';
    $extension = $meta['output_extension'] ?? 'webm';
    $bitrate = intval($meta['bitrate'] ?? $config['default_bitrate'] ?? 192);

    // Validiere Format gegen Config
    if (!isset($config['output_formats'][$outputFormat])) {
        $outputFormat = $config['default_format'] ?? 'webm';
        $extension = $config['output_formats'][$outputFormat]['extension'];
    }

    $formatConfig = $config['output_formats'][$outputFormat];
    $ffmpegCodec = $formatConfig['ffmpeg_codec'];
    $bitrateFlag = $formatConfig['bitrate_flag'] ?? '-b:a';
    $maxBitrate = $formatConfig['max_bitrate'] ?? 320;

    // Begrenze Bitrate auf Format-Maximum
    if ($bitrate > $maxBitrate) {
        $bitrate = $maxBitrate;
    }

    // Validiere Bitrate
    if (!isValidBitrate($bitrate, $config['available_bitrates'] ?? [64, 128, 192, 256, 320])) {
        $bitrate = $config['default_bitrate'] ?? 192;
    }

    // Validiere Extension
    if (!isValidExtension($extension)) {
        $extension = $formatConfig['extension'];
    }

    // Update status
    $meta['status'] = 'converting';
    $meta['progress'] = 0;
    $meta['start_time'] = time();
    file_put_contents($metaFile, json_encode($meta));

    // Prüfe ob Stream-Copy möglich ist (alle Inputs = Output-Format)
    $useStreamCopy = canUseStreamCopy($sessionDir, $outputFormat);

    // Start FFmpeg
    $concatFile = $sessionDir . 'concat.txt';
    $outputFile = $sessionDir . 'playlist.' . $extension;
    $logFile = $sessionDir . 'ffmpeg.log';

    if ($useStreamCopy) {
        $cmd = sprintf(
            'ffmpeg -f concat -safe 0 -i %s -c:a copy -y %s > %s 2>&1',
            escapeshellarg($concatFile),
            escapeshellarg($outputFile),
            escapeshellarg($logFile)
        );
        fwrite(STDOUT, "  → FFmpeg läuft (Stream-Copy, kein Re-Encoding)...\n");
    } else {
        $cmd = sprintf(
            'ffmpeg -f concat -safe 0 -i %s %s %s %dk -threads 0 -y %s > %s 2>&1',
            escapeshellarg($concatFile),
            $ffmpegCodec,
            $bitrateFlag,
            $bitrate,
            escapeshellarg($outputFile),
            escapeshellarg($logFile)
        );
        fwrite(STDOUT, "  → FFmpeg läuft (" . $outputFormat . " @ " . $bitrate . "k)...\n");
    }

    // Führe FFmpeg aus und warte auf Abschluss
    exec($cmd, $output, $returnCode);

    if ($returnCode === 0 && file_exists($outputFile)) {
        // Erfolg
        $meta = json_decode(file_get_contents($metaFile), true);
        $meta['status'] = 'done';
        $meta['progress'] = 100;
        $meta['file_size'] = filesize($outputFile);
        file_put_contents($metaFile, json_encode($meta));

        $sizeMB = round($meta['file_size'] / 1024 / 1024, 2);
        fwrite(STDOUT, "  ✓ Konvertierung abgeschlossen (" . $sizeMB . " MB)\n");

        return true;
    } else {
        // Fehler
        $meta = json_decode(file_get_contents($metaFile), true);
        $meta['status'] = 'error';
        $meta['error'] = 'FFmpeg Fehler - Return Code: ' . $returnCode;
        file_put_contents($metaFile, json_encode($meta));

        fwrite(STDERR, "  ✗ FFmpeg Fehler (Return Code: " . $returnCode . ")\n");

        return false;
    }
}

/**
 * Prüft ob Stream-Copy möglich ist (alle Input-Dateien haben dasselbe Format wie Output)
 */
function canUseStreamCopy($sessionDir, $outputFormat) {
    $concatFile = $sessionDir . 'concat.txt';
    if (!file_exists($concatFile)) {
        return false;
    }

    // Mapping: Output-Format → erwarteter Input-Codec
    $formatToCodec = [
        'mp3' => 'mp3',
        'ogg' => 'vorbis',
        'webm' => 'opus'
    ];

    $expectedCodec = $formatToCodec[$outputFormat] ?? null;
    if ($expectedCodec === null) {
        return false;
    }

    $lines = file($concatFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (preg_match("/^file '(.+)'$/", $line, $matches)) {
            $filePath = $sessionDir . $matches[1];
            if (!file_exists($filePath)) {
                return false;
            }
            $cmd = sprintf(
                'ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 %s 2>/dev/null',
                escapeshellarg($filePath)
            );
            $codec = trim(shell_exec($cmd) ?? '');
            if ($codec !== $expectedCodec) {
                return false;
            }
        }
    }

    return true;
}
