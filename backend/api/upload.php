<?php
// Lade Sicherheitsfunktionen
require_once __DIR__ . '/../security.php';

// Setze sichere Header
header('Content-Type: application/json');
setSecurityHeaders();
setCorsHeaders(['POST', 'OPTIONS']);

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError(405, 'Method not allowed');
}

// Maximale Dateigröße pro Upload (500MB pro Datei)
$maxFileSize = 500 * 1024 * 1024;

// Maximale Anzahl Dateien
$maxFiles = 200;

$uploadDir = __DIR__ . '/../temp/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$sessionId = bin2hex(random_bytes(16));
$sessionDir = $uploadDir . $sessionId . '/';
mkdir($sessionDir, 0755, true);

$files = $_FILES['files'] ?? [];
$order = $_POST['order'] ?? [];

if (empty($files['name'])) {
    sendJsonError(400, 'Keine Dateien hochgeladen');
}

$uploadedFiles = [];
$count = min(count($files['name']), $maxFiles); // Begrenze Anzahl

for ($i = 0; $i < $count; $i++) {
    $tmpName = $files['tmp_name'][$i];
    $name = basename($files['name'][$i]);
    $size = $files['size'][$i];
    $error = $files['error'][$i];

    // Prüfe Upload-Fehler
    if ($error !== UPLOAD_ERR_OK) {
        continue;
    }

    // Prüfe Dateigröße
    if ($size > $maxFileSize) {
        continue;
    }

    // Prüfe MIME-Type (zusätzlich zur Extension)
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $tmpName);
    finfo_close($finfo);

    $allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'];
    if (!in_array($mimeType, $allowedMimes)) {
        continue;
    }

    // Prüfe Extension
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp3', 'wav'], true)) {
        continue;
    }

    // Sanitiere Dateinamen
    $orderIndex = isset($order[$i]) ? str_pad(intval($order[$i]), 4, '0', STR_PAD_LEFT) : str_pad($i, 4, '0', STR_PAD_LEFT);
    $safeName = sanitizeFilename($name);
    $targetName = $orderIndex . '_' . $safeName;
    $targetPath = $sessionDir . $targetName;

    if (move_uploaded_file($tmpName, $targetPath)) {
        $uploadedFiles[] = $targetName;
    }
}

if (empty($uploadedFiles)) {
    // Cleanup leeres Verzeichnis
    rmdir($sessionDir);
    sendJsonError(400, 'Keine gültigen Audio-Dateien');
}

// Create file list for FFmpeg concat
$concatFile = $sessionDir . 'concat.txt';
$fp = fopen($concatFile, 'w');
foreach ($uploadedFiles as $file) {
    // Escape single quotes im Dateinamen für FFmpeg
    $escapedFile = str_replace("'", "'\\''", $file);
    fwrite($fp, "file '" . $escapedFile . "'\n");
}
fclose($fp);

// Gesamtdauer aller Dateien berechnen (für Fortschrittsanzeige)
$totalDuration = 0;
foreach ($uploadedFiles as $file) {
    $filePath = $sessionDir . $file;
    $cmd = sprintf(
        'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s 2>/dev/null',
        escapeshellarg($filePath)
    );
    $duration = trim(shell_exec($cmd) ?? '');
    if (is_numeric($duration)) {
        $totalDuration += floatval($duration);
    }
}

// Save metadata
file_put_contents($sessionDir . 'meta.json', json_encode([
    'session_id' => $sessionId,
    'files' => $uploadedFiles,
    'status' => 'uploaded',
    'created_at' => time(),
    'total_duration' => $totalDuration > 0 ? $totalDuration : null
]));

echo json_encode([
    'success' => true,
    'session_id' => $sessionId,
    'file_count' => count($uploadedFiles)
]);
