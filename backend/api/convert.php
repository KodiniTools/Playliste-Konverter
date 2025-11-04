<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Lade Konfiguration
$config = require __DIR__ . '/../config.php';

$input = json_decode(file_get_contents('php://input'), true);
$sessionId = $input['session_id'] ?? '';

if (empty($sessionId) || !preg_match('/^[a-f0-9]{32}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Session-ID']);
    exit;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

if (!is_dir($sessionDir) || !file_exists($metaFile)) {
    http_response_code(404);
    echo json_encode(['error' => 'Session nicht gefunden']);
    exit;
}

$meta = json_decode(file_get_contents($metaFile), true);

// Prüfe ob Queue-System aktiv ist
if ($config['use_queue']) {
    // Queue-Modus: Füge Job zur Queue hinzu
    require_once __DIR__ . '/../queue.php';

    $queue = new ConversionQueue();
    $queue->addToQueue($sessionId);

    $meta['status'] = 'queued';
    $meta['progress'] = 0;
    $meta['queue_position'] = $queue->getQueuePosition($sessionId);
    file_put_contents($metaFile, json_encode($meta));

    echo json_encode([
        'success' => true,
        'message' => 'In Warteschlange eingereiht',
        'queue_position' => $meta['queue_position']
    ]);

} else {
    // Direkter Modus: Starte FFmpeg sofort (wie vorher)
    $meta['status'] = 'converting';
    $meta['progress'] = 0;
    file_put_contents($metaFile, json_encode($meta));

    // Start FFmpeg in background
    $concatFile = $sessionDir . 'concat.txt';
    $outputFile = $sessionDir . 'playlist.webm';
    $logFile = $sessionDir . 'ffmpeg.log';

    $cmd = sprintf(
        'ffmpeg -f concat -safe 0 -i %s -c:a libopus -b:a 128k -threads 4 -y %s > %s 2>&1 & echo $!',
        escapeshellarg($concatFile),
        escapeshellarg($outputFile),
        escapeshellarg($logFile)
    );

    $pid = shell_exec($cmd);
    $meta['pid'] = trim($pid);
    file_put_contents($metaFile, json_encode($meta));

    echo json_encode(['success' => true, 'message' => 'Konvertierung gestartet']);
}

