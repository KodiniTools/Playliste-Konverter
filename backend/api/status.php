<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Lade Konfiguration
$config = require __DIR__ . '/../config.php';

$sessionId = basename($_GET['id'] ?? '');

if (empty($sessionId) || !preg_match('/^[a-f0-9]{32}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Session-ID']);
    exit;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

if (!file_exists($metaFile)) {
    http_response_code(404);
    echo json_encode(['error' => 'Session nicht gefunden']);
    exit;
}

$meta = json_decode(file_get_contents($metaFile), true);
$outputFile = $sessionDir . 'playlist.webm';
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

// Funktion um Gesamtdauer aus concat.txt zu berechnen
function getTotalDuration($sessionDir) {
    $concatFile = $sessionDir . 'concat.txt';
    if (!file_exists($concatFile)) {
        return null;
    }

    $totalDuration = 0;
    $lines = file($concatFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        if (preg_match("/^file '(.+)'$/", $line, $matches)) {
            $filePath = $matches[1];
            // Nutze ffprobe um Dauer zu ermitteln
            $cmd = sprintf(
                'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s 2>/dev/null',
                escapeshellarg($filePath)
            );
            $duration = trim(shell_exec($cmd));
            if (is_numeric($duration)) {
                $totalDuration += floatval($duration);
            }
        }
    }

    return $totalDuration > 0 ? $totalDuration : null;
}

// Check if FFmpeg process is still running (nur im direkten Modus oder wenn aus Queue gestartet)
if (isset($meta['pid'])) {
    $pidCheck = shell_exec("ps -p {$meta['pid']} -o pid=");
    $isRunning = !empty(trim($pidCheck));

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
        // Berechne Fortschritt aus FFmpeg-Log
        if (file_exists($logFile)) {
            $log = file_get_contents($logFile);

            // Extrahiere aktuelle Zeit aus FFmpeg-Log
            // FFmpeg gibt Zeit im Format "time=00:01:23.45" aus
            if (preg_match_all('/time=(\d+):(\d+):(\d+\.?\d*)/', $log, $matches, PREG_SET_ORDER)) {
                // Nimm den letzten Match (aktuellster Fortschritt)
                $lastMatch = end($matches);
                $currentSeconds = $lastMatch[1] * 3600 + $lastMatch[2] * 60 + floatval($lastMatch[3]);

                // Hole Gesamtdauer (einmal berechnen und cachen)
                if (!isset($meta['total_duration'])) {
                    $meta['total_duration'] = getTotalDuration($sessionDir);
                    file_put_contents($metaFile, json_encode($meta));
                }

                $totalDuration = $meta['total_duration'];

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
