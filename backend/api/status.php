<?php
// Lade Sicherheitsfunktionen und Konfiguration
require_once __DIR__ . '/../security.php';
$config = require __DIR__ . '/../config.php';

// Setze sichere Header
header('Content-Type: application/json');
setSecurityHeaders();
setCorsHeaders(['GET', 'OPTIONS']);

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$sessionId = basename($_GET['id'] ?? '');

if (!isValidSessionId($sessionId)) {
    sendJsonError(400, 'Ungültige Session-ID');
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

if (!file_exists($metaFile)) {
    sendJsonError(404, 'Session nicht gefunden');
}

$meta = json_decode(file_get_contents($metaFile), true);

// Validiere Extension aus Meta-Daten
$extension = $meta['output_extension'] ?? 'webm';
if (!isValidExtension($extension)) {
    $extension = 'webm'; // Fallback auf sicheren Wert
}

$outputFile = $sessionDir . 'playlist.' . $extension;
$logFile = $sessionDir . 'ffmpeg.log';

// Prüfe Queue-Status wenn Queue aktiviert ist
if (isset($config['use_queue']) && $config['use_queue'] === true && $meta['status'] === 'queued') {
    require_once __DIR__ . '/../queue.php';

    $queue = new ConversionQueue();
    $queueStatus = $queue->getStatus($sessionId);

    if ($queueStatus) {
        $meta['queue_position'] = $queue->getQueuePosition($sessionId);

        // Wenn Queue-Status "processing" ist, prüfe ob auch wirklich konvertiert wird
        if ($queueStatus['status'] === 'processing') {
            $meta['status'] = 'converting';
        } elseif ($queueStatus['status'] === 'completed') {
            $meta['status'] = 'done';
            $meta['progress'] = 100;
        } elseif ($queueStatus['status'] === 'failed') {
            $meta['status'] = 'error';
            $meta['error'] = $queueStatus['error'] ?? 'Queue-Fehler';
        }
    }
}

// Funktion um Gesamtdauer zu ermitteln (aus meta.json oder per ffprobe als Fallback)
function getTotalDuration($sessionDir, &$meta, $metaFile) {
    // Bereits beim Upload berechnet?
    if (isset($meta['total_duration']) && $meta['total_duration'] > 0) {
        return $meta['total_duration'];
    }

    // Fallback: per ffprobe berechnen
    $concatFile = $sessionDir . 'concat.txt';
    if (!file_exists($concatFile)) {
        return null;
    }

    $totalDuration = 0;
    $lines = file($concatFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        if (preg_match("/^file '(.+)'$/", $line, $matches)) {
            $filePath = $sessionDir . $matches[1];
            $cmd = sprintf(
                'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s 2>/dev/null',
                escapeshellarg($filePath)
            );
            $duration = trim(shell_exec($cmd) ?? '');
            if (is_numeric($duration)) {
                $totalDuration += floatval($duration);
            }
        }
    }

    // Cache für zukünftige Polls
    if ($totalDuration > 0) {
        $meta['total_duration'] = $totalDuration;
        file_put_contents($metaFile, json_encode($meta));
    }

    return $totalDuration > 0 ? $totalDuration : null;
}

/**
 * Liest nur die letzten Bytes einer Datei (statt das gesamte Log)
 */
function readLogTail($logFile, $bytes = 4096) {
    if (!file_exists($logFile)) {
        return '';
    }
    $fileSize = filesize($logFile);
    if ($fileSize === 0) {
        return '';
    }
    $fp = fopen($logFile, 'r');
    if ($fp === false) {
        return '';
    }
    $offset = max(0, $fileSize - $bytes);
    fseek($fp, $offset);
    $content = fread($fp, $bytes);
    fclose($fp);
    return $content ?: '';
}

// Check if FFmpeg process is still running (nur im direkten Modus oder wenn aus Queue gestartet)
if (isset($meta['pid'])) {
    // SICHERHEIT: Validiere PID bevor sie verwendet wird
    if (!isValidPid($meta['pid'])) {
        logSecurityEvent('invalid_pid', ['session_id' => $sessionId, 'pid' => $meta['pid']]);
        $isRunning = false;
    } else {
        // Sichere Methode: Prüfe über /proc Dateisystem statt shell_exec
        $isRunning = isProcessRunning($meta['pid']);
    }

    if ($isRunning === false && file_exists($outputFile)) {
        $meta['status'] = 'done';
        $meta['progress'] = 100;
        $meta['file_size'] = filesize($outputFile);
        file_put_contents($metaFile, json_encode($meta));
    } elseif ($isRunning === false && $meta['status'] === 'converting') {
        // Process ended but no output file - error
        $meta['status'] = 'error';
        $meta['error'] = 'FFmpeg Fehler - siehe Log';
        file_put_contents($metaFile, json_encode($meta));
    } else {
        // Berechne Fortschritt aus FFmpeg-Log (nur letzten Teil lesen)
        if (file_exists($logFile)) {
            $log = readLogTail($logFile);

            // Extrahiere aktuelle Zeit aus FFmpeg-Log
            // FFmpeg gibt Zeit im Format "time=00:01:23.45" aus
            if (preg_match_all('/time=(\d+):(\d+):(\d+\.?\d*)/', $log, $matches, PREG_SET_ORDER)) {
                // Nimm den letzten Match (aktuellster Fortschritt)
                $lastMatch = end($matches);
                $currentSeconds = $lastMatch[1] * 3600 + $lastMatch[2] * 60 + floatval($lastMatch[3]);

                // Hole Gesamtdauer (bereits beim Upload berechnet oder Fallback)
                $totalDuration = getTotalDuration($sessionDir, $meta, $metaFile);

                if ($totalDuration && $totalDuration > 0) {
                    // Berechne echten Fortschritt
                    $meta['progress'] = min(99, round(($currentSeconds / $totalDuration) * 100));
                } else {
                    // Fallback: Schätze basierend auf Dateigröße und Zeit
                    // Wenn keine Dauer bekannt, nutze zeitbasierte Schätzung
                    $startTime = $meta['start_time'] ?? time();
                    $elapsed = time() - $startTime;
                    // Schätze: kleine Dateien 30s, große 5min
                    $estimatedTotal = max(30, min(300, $elapsed * 2));
                    $meta['progress'] = min(95, round(($elapsed / $estimatedTotal) * 100));
                }
            } else {
                // Kein Zeitstempel im Log - FFmpeg startet gerade
                $meta['progress'] = max($meta['progress'] ?? 0, 5);
            }
        }
    }
}

$response = [
    'status' => $meta['status'],
    'progress' => $meta['progress'] ?? 0,
    'error' => $meta['error'] ?? null
];

// Füge Queue-Position hinzu wenn vorhanden
if (isset($meta['queue_position'])) {
    $response['queue_position'] = $meta['queue_position'];
}

// Füge Dateigröße hinzu wenn vorhanden
if (isset($meta['file_size'])) {
    $response['file_size'] = $meta['file_size'];
}

echo json_encode($response);
