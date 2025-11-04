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
if ($config['use_queue'] && $meta['status'] === 'queued') {
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

// Check if FFmpeg process is still running (nur im direkten Modus oder wenn aus Queue gestartet)
if (isset($meta['pid'])) {
    $pidCheck = shell_exec("ps -p {$meta['pid']} -o pid=");
    $isRunning = !empty(trim($pidCheck));

    if (!$isRunning && file_exists($outputFile)) {
        $meta['status'] = 'done';
        $meta['progress'] = 100;
        $meta['file_size'] = filesize($outputFile);
        file_put_contents($metaFile, json_encode($meta));
    } elseif (!$isRunning && $meta['status'] === 'converting') {
        // Process ended but no output file - error
        $meta['status'] = 'error';
        $meta['error'] = 'FFmpeg Fehler - siehe Log';
        file_put_contents($metaFile, json_encode($meta));
    } else {
        // Estimate progress from log (very rough)
        if (file_exists($logFile)) {
            $log = file_get_contents($logFile);
            if (preg_match('/time=(\d+):(\d+):(\d+)/', $log, $matches)) {
                $seconds = $matches[1] * 3600 + $matches[2] * 60 + $matches[3];
                // Assume max 1 hour total for 50 tracks
                $meta['progress'] = min(99, ($seconds / 3600) * 100);
            } else {
                $meta['progress'] = 50; // Default mid-point
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
