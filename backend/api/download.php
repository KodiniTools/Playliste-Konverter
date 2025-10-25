<?php
$sessionId = basename($_GET['id'] ?? '');

if (empty($sessionId) || !preg_match('/^[a-f0-9]{32}$/', $sessionId)) {
    http_response_code(400);
    echo 'Ungültige Session-ID';
    exit;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$outputFile = $sessionDir . 'playlist.webm';

if (!file_exists($outputFile)) {
    http_response_code(404);
    echo 'Datei nicht gefunden';
    exit;
}

header('Content-Type: audio/webm');
header('Content-Disposition: attachment; filename="playlist.webm"');
header('Content-Length: ' . filesize($outputFile));
readfile($outputFile);

// Cleanup after download
$cleanup = function() use ($sessionDir) {
    $files = glob($sessionDir . '*');
    foreach ($files as $file) {
        if (is_file($file)) unlink($file);
    }
    rmdir($sessionDir);
};

register_shutdown_function($cleanup);
