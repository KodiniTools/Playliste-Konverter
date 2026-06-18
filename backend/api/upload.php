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

// Maximale Anzahl Dateien gesamt
$maxFiles = 200;

$uploadDir = __DIR__ . '/../temp/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Chunked-Upload: Session-ID aus POST übernehmen oder neu erstellen
$existingSessionId = $_POST['session_id'] ?? null;
$totalFiles = isset($_POST['total_files']) ? intval($_POST['total_files']) : null;
$chunkIndex = isset($_POST['chunk_index']) ? intval($_POST['chunk_index']) : null;
$isChunked = $existingSessionId !== null && $totalFiles !== null && $chunkIndex !== null;

if ($isChunked && !isValidSessionId($existingSessionId)) {
    sendJsonError(400, 'Ungültige Session-ID');
}

if ($isChunked) {
    $sessionId = $existingSessionId;
    $sessionDir = $uploadDir . $sessionId . '/';
    if (!is_dir($sessionDir)) {
        sendJsonError(404, 'Session nicht gefunden');
    }
} else {
    $sessionId = bin2hex(random_bytes(16));
    $sessionDir = $uploadDir . $sessionId . '/';
    mkdir($sessionDir, 0755, true);
}

$files = $_FILES['files'] ?? [];
$order = $_POST['order'] ?? [];

if (empty($files['name'])) {
    sendJsonError(400, 'Keine Dateien hochgeladen');
}

$newFiles = [];
$count = min(count($files['name']), $maxFiles);

for ($i = 0; $i < $count; $i++) {
    $tmpName = $files['tmp_name'][$i];
    $name = basename($files['name'][$i]);
    $size = $files['size'][$i];
    $error = $files['error'][$i];

    if ($error !== UPLOAD_ERR_OK) {
        continue;
    }

    if ($size > $maxFileSize) {
        continue;
    }

    // MIME-Type prüfen
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $tmpName);
    finfo_close($finfo);

    $allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'];
    if (!in_array($mimeType, $allowedMimes)) {
        continue;
    }

    // Extension prüfen
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp3', 'wav'], true)) {
        continue;
    }

    // Dateiname aus order[] ableiten (global index über alle Chunks)
    $orderVal = isset($order[$i]) ? intval($order[$i]) : ($isChunked ? $chunkIndex : $i);
    $orderIndex = str_pad($orderVal, 4, '0', STR_PAD_LEFT);
    $safeName = sanitizeFilename($name);
    $targetName = $orderIndex . '_' . $safeName;
    $targetPath = $sessionDir . $targetName;

    if (move_uploaded_file($tmpName, $targetPath)) {
        $newFiles[] = $targetName;
    }
}

if (empty($newFiles)) {
    if (!$isChunked) {
        rmdir($sessionDir);
    }
    sendJsonError(400, 'Keine gültigen Audio-Dateien');
}

// Bestehende Dateiliste lesen (Chunked-Mode) oder neu anlegen
$metaFile = $sessionDir . 'meta.json';
if ($isChunked && file_exists($metaFile)) {
    $meta = json_decode(file_get_contents($metaFile), true);
    $allFiles = array_merge($meta['files'] ?? [], $newFiles);
} else {
    $meta = [];
    $allFiles = $newFiles;
}

// Sortieren nach Präfix (0001_, 0002_, …)
sort($allFiles);

// Letzter Chunk? → concat.txt schreiben und Status auf 'uploaded' setzen
$isLastChunk = !$isChunked || ($chunkIndex + 1 >= $totalFiles);

if ($isLastChunk) {
    $concatFile = $sessionDir . 'concat.txt';
    $fp = fopen($concatFile, 'w');
    foreach ($allFiles as $file) {
        $escapedFile = str_replace("'", "'\\''", $file);
        fwrite($fp, "file '" . $escapedFile . "'\n");
    }
    fclose($fp);

    file_put_contents($metaFile, json_encode([
        'session_id' => $sessionId,
        'files' => $allFiles,
        'status' => 'uploaded',
        'created_at' => $meta['created_at'] ?? time(),
        'total_duration' => null,
    ]));
} else {
    // Zwischenspeichern ohne Status-Change
    file_put_contents($metaFile, json_encode([
        'session_id' => $sessionId,
        'files' => $allFiles,
        'status' => 'uploading',
        'created_at' => $meta['created_at'] ?? time(),
        'total_duration' => null,
    ]));
}

echo json_encode([
    'success' => true,
    'session_id' => $sessionId,
    'file_count' => count($allFiles),
    'chunk_index' => $chunkIndex,
    'is_last_chunk' => $isLastChunk,
]);
