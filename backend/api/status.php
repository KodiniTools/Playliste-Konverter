<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

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

// Check if FFmpeg process is still running
if (isset($meta['pid'])) {
    $pidCheck = shell_exec("ps -p {$meta['pid']} -o pid=");
    $isRunning = !empty(trim($pidCheck));
    
    if (!$isRunning && file_exists($outputFile)) {
        $meta['status'] = 'done';
        $meta['progress'] = 100;
        file_put_contents($metaFile, json_encode($meta));
    } elseif (!$isRunning) {
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

echo json_encode([
    'status' => $meta['status'],
    'progress' => $meta['progress'] ?? 0,
    'error' => $meta['error'] ?? null
]);
