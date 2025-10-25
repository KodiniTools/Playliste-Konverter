<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

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
    http_response_code(400);
    echo json_encode(['error' => 'Keine Dateien hochgeladen']);
    exit;
}

$uploadedFiles = [];
$count = count($files['name']);

for ($i = 0; $i < $count; $i++) {
    $tmpName = $files['tmp_name'][$i];
    $name = basename($files['name'][$i]);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    
    if (!in_array($ext, ['mp3', 'wav'])) {
        continue;
    }
    
    $orderIndex = isset($order[$i]) ? str_pad($order[$i], 4, '0', STR_PAD_LEFT) : str_pad($i, 4, '0', STR_PAD_LEFT);
    $targetName = $orderIndex . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    $targetPath = $sessionDir . $targetName;
    
    if (move_uploaded_file($tmpName, $targetPath)) {
        $uploadedFiles[] = $targetName;
    }
}

if (empty($uploadedFiles)) {
    http_response_code(400);
    echo json_encode(['error' => 'Keine gültigen Audio-Dateien']);
    exit;
}

// Create file list for FFmpeg concat
$concatFile = $sessionDir . 'concat.txt';
$fp = fopen($concatFile, 'w');
foreach ($uploadedFiles as $file) {
    fwrite($fp, "file '" . $file . "'\n");
}
fclose($fp);

// Save metadata
file_put_contents($sessionDir . 'meta.json', json_encode([
    'session_id' => $sessionId,
    'files' => $uploadedFiles,
    'status' => 'uploaded',
    'created_at' => time()
]));

echo json_encode([
    'success' => true,
    'session_id' => $sessionId,
    'file_count' => count($uploadedFiles)
]);
