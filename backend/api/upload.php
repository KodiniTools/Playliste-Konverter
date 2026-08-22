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

// Chunked-Upload: Session-ID aus POST übernehmen oder neu erstellen.
// Zwei unabhängige Aspekte:
//  - $hasSession:  Request setzt eine bestehende Session fort (session_id gesetzt)
//  - $isMultipart: Upload besteht aus mehreren Requests (total_files + chunk_index)
// Der erste Request eines Multipart-Uploads legt die Session an und hat daher
// noch keine session_id, ist aber trotzdem Multipart.
$existingSessionId = $_POST['session_id'] ?? null;
$totalFiles = isset($_POST['total_files']) ? intval($_POST['total_files']) : null;
$chunkIndex = isset($_POST['chunk_index']) ? intval($_POST['chunk_index']) : null;
$hasSession = $existingSessionId !== null;
$isMultipart = $totalFiles !== null && $chunkIndex !== null;

if ($hasSession && !isValidSessionId($existingSessionId)) {
    sendJsonError(400, 'Ungültige Session-ID');
}

if ($hasSession) {
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
    $orderVal = isset($order[$i]) ? intval($order[$i]) : ($isMultipart ? $chunkIndex : $i);
    $orderIndex = str_pad($orderVal, 4, '0', STR_PAD_LEFT);
    $safeName = sanitizeFilename($name);
    $targetName = $orderIndex . '_' . $safeName;
    $targetPath = $sessionDir . $targetName;

    if (move_uploaded_file($tmpName, $targetPath)) {
        $newFiles[] = $targetName;
    }
}

if (empty($newFiles)) {
    // Nur eine ganz neu angelegte (leere) Session wieder entfernen.
    if (!$hasSession) {
        rmdir($sessionDir);
    }
    sendJsonError(400, 'Keine gültigen Audio-Dateien');
}

// Marker für diesen Chunk ablegen, damit parallele Uploads erkennen können,
// wann alle Chunks eingetroffen sind (unabhängig von der Reihenfolge).
if ($isMultipart) {
    // Kein Punkt-Präfix, damit cleanup.php (glob '*') die Datei mit aufräumt.
    touch($sessionDir . 'chunk_' . $chunkIndex . '.done');
}

$metaFile = $sessionDir . 'meta.json';

// Kritischer Abschnitt: nur ein Prozess darf gleichzeitig meta.json/concat.txt
// schreiben. Verhindert Races zwischen parallel hochgeladenen Chunks.
$lockHandle = fopen($sessionDir . 'upload.lock', 'c');
if ($lockHandle !== false) {
    flock($lockHandle, LOCK_EX);
}

// Aktuelle Dateiliste immer frisch aus dem Verzeichnis lesen (statt aus meta.json
// mergen). So gehen bei parallelen Uploads keine Einträge verloren.
$allPaths = glob($sessionDir . '[0-9][0-9][0-9][0-9]_*') ?: [];
$allFiles = array_map('basename', $allPaths);
sort($allFiles);

// Sind alle erwarteten Chunks eingetroffen?
if ($isMultipart) {
    $receivedChunks = count(glob($sessionDir . 'chunk_*.done') ?: []);
    $isComplete = $receivedChunks >= $totalFiles;
} else {
    $isComplete = true;
}

// created_at aus bestehendem meta.json übernehmen
$createdAt = time();
if (file_exists($metaFile)) {
    $existingMeta = json_decode(file_get_contents($metaFile), true);
    if (isset($existingMeta['created_at'])) {
        $createdAt = $existingMeta['created_at'];
    }
}

if ($isComplete) {
    // Alle Chunks da → concat.txt schreiben und Status auf 'uploaded' setzen
    $concatFile = $sessionDir . 'concat.txt';
    $fp = fopen($concatFile, 'w');
    foreach ($allFiles as $file) {
        $escapedFile = str_replace("'", "'\\''", $file);
        fwrite($fp, "file '" . $escapedFile . "'\n");
    }
    fclose($fp);
}

file_put_contents($metaFile, json_encode([
    'session_id' => $sessionId,
    'files' => $allFiles,
    'status' => $isComplete ? 'uploaded' : 'uploading',
    'created_at' => $createdAt,
    'total_duration' => null,
]));

if ($lockHandle !== false) {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}

echo json_encode([
    'success' => true,
    'session_id' => $sessionId,
    'file_count' => count($allFiles),
    'chunk_index' => $chunkIndex,
    'is_last_chunk' => $isComplete,
]);
