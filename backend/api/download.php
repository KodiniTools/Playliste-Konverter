<?php
// Lade Sicherheitsfunktionen und Konfiguration
require_once __DIR__ . '/../security.php';
$config = require __DIR__ . '/../config.php';

// Setze sichere Header (ohne Content-Type, der wird später gesetzt)
setSecurityHeaders();

$sessionId = basename($_GET['id'] ?? '');

if (!isValidSessionId($sessionId)) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Ungültige Session-ID';
    exit;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

// Prüfe ob Session-Verzeichnis existiert und innerhalb des erlaubten Bereichs liegt
$tempDir = realpath(__DIR__ . '/../temp/');
$realSessionDir = realpath($sessionDir);

if ($realSessionDir === false || strpos($realSessionDir, $tempDir) !== 0) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Ungültige Session';
    exit;
}

// Lese Meta-Daten für Format-Information
if (!file_exists($metaFile)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Session nicht gefunden';
    exit;
}

$meta = json_decode(file_get_contents($metaFile), true);

// Validiere Extension
$extension = $meta['output_extension'] ?? 'webm';
if (!isValidExtension($extension)) {
    $extension = 'webm';
}

$format = $meta['output_format'] ?? 'webm';
if (!isset($config['output_formats'][$format])) {
    $format = 'webm';
}

$formatConfig = $config['output_formats'][$format];
$mimeType = $formatConfig['mime_type'] ?? 'audio/webm';

$outputFile = $sessionDir . 'playlist.' . $extension;

// Prüfe ob Output-Datei existiert und innerhalb des Session-Verzeichnisses liegt
$realOutputFile = realpath($outputFile);
if ($realOutputFile === false || strpos($realOutputFile, $realSessionDir) !== 0) {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Datei nicht gefunden';
    exit;
}

if (!file_exists($outputFile)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Datei nicht gefunden';
    exit;
}

// Sanitiere Extension für Header
$safeExtension = preg_replace('/[^a-z0-9]/', '', $extension);

header('Content-Type: ' . $mimeType);
header('Content-Disposition: attachment; filename="playlist.' . $safeExtension . '"');
header('Content-Length: ' . filesize($outputFile));

// Deaktiviere Output-Buffering für große Dateien
if (ob_get_level()) {
    ob_end_clean();
}

readfile($outputFile);

// Cleanup after download
$cleanup = function() use ($sessionDir) {
    if (!is_dir($sessionDir)) {
        return;
    }

    $files = glob($sessionDir . '*');
    if ($files === false) {
        return;
    }

    foreach ($files as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }

    // Nur löschen wenn Verzeichnis leer ist
    $remaining = glob($sessionDir . '*');
    if (empty($remaining)) {
        rmdir($sessionDir);
    }
};

register_shutdown_function($cleanup);
