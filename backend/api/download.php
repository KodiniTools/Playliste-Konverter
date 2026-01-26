<?php
// Lade Konfiguration
$config = require __DIR__ . '/../config.php';

$sessionId = basename($_GET['id'] ?? '');

if (empty($sessionId) || !preg_match('/^[a-f0-9]{32}$/', $sessionId)) {
    http_response_code(400);
    echo 'Ungültige Session-ID';
    exit;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

// Lese Meta-Daten für Format-Information
$meta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : [];
$extension = $meta['output_extension'] ?? 'webm';
$format = $meta['output_format'] ?? 'webm';
$formatConfig = $config['output_formats'][$format] ?? $config['output_formats']['webm'];
$mimeType = $formatConfig['mime_type'] ?? 'audio/webm';

$outputFile = $sessionDir . 'playlist.' . $extension;

if (!file_exists($outputFile)) {
    http_response_code(404);
    echo 'Datei nicht gefunden';
    exit;
}

header('Content-Type: ' . $mimeType);
header('Content-Disposition: attachment; filename="playlist.' . $extension . '"');
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
