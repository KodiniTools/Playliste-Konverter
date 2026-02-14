<?php
// Lade Sicherheitsfunktionen und Konfiguration
require_once __DIR__ . '/../security.php';
$config = require __DIR__ . '/../config.php';

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

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    sendJsonError(400, 'Ungültige Anfrage');
}

$sessionId = $input['session_id'] ?? '';
$outputFormat = $input['format'] ?? $config['default_format'] ?? 'webm';
$bitrate = intval($input['bitrate'] ?? $config['default_bitrate'] ?? 192);

// Validiere Session-ID
if (!isValidSessionId($sessionId)) {
    sendJsonError(400, 'Ungültige Session-ID');
}

// Validiere Format
$supportedFormats = array_keys($config['output_formats'] ?? ['webm' => []]);
if (!in_array($outputFormat, $supportedFormats, true)) {
    $outputFormat = $config['default_format'] ?? 'webm';
}

// Validiere Bitrate
if (!isValidBitrate($bitrate, $config['available_bitrates'] ?? [64, 128, 192, 256, 320])) {
    $bitrate = $config['default_bitrate'] ?? 192;
}

$formatConfig = $config['output_formats'][$outputFormat];
$maxBitrate = $formatConfig['max_bitrate'] ?? 320;

// Begrenze Bitrate auf Format-Maximum
if ($bitrate > $maxBitrate) {
    $bitrate = $maxBitrate;
}

$sessionDir = __DIR__ . '/../temp/' . $sessionId . '/';
$metaFile = $sessionDir . 'meta.json';

if (!is_dir($sessionDir) || !file_exists($metaFile)) {
    sendJsonError(404, 'Session nicht gefunden');
}

$meta = json_decode(file_get_contents($metaFile), true);

// Prüfe ob bereits konvertiert wird
if (isset($meta['status']) && in_array($meta['status'], ['converting', 'queued'])) {
    sendJsonError(409, 'Konvertierung läuft bereits');
}

// Prüfe ob Queue-System aktiv ist
if (isset($config['use_queue']) && $config['use_queue'] === true) {
    // Queue-Modus: Füge Job zur Queue hinzu
    require_once __DIR__ . '/../queue.php';

    $extension = $formatConfig['extension'];

    $queue = new ConversionQueue();
    $queue->addToQueue($sessionId);

    $meta['status'] = 'queued';
    $meta['progress'] = 0;
    $meta['queue_position'] = $queue->getQueuePosition($sessionId);
    $meta['output_format'] = $outputFormat;
    $meta['output_extension'] = $extension;
    $meta['bitrate'] = $bitrate;
    file_put_contents($metaFile, json_encode($meta));

    echo json_encode([
        'success' => true,
        'message' => 'In Warteschlange eingereiht',
        'queue_position' => $meta['queue_position'],
        'format' => $outputFormat,
        'bitrate' => $bitrate
    ]);

} else {
    // Direkter Modus: Starte FFmpeg sofort
    $formatConfig = $config['output_formats'][$outputFormat] ?? $config['output_formats']['webm'];
    $extension = $formatConfig['extension'];
    $ffmpegCodec = $formatConfig['ffmpeg_codec'];
    $bitrateFlag = $formatConfig['bitrate_flag'] ?? '-b:a';

    // Validiere Extension nochmal
    if (!isValidExtension($extension)) {
        $extension = 'webm';
    }

    $meta['status'] = 'converting';
    $meta['progress'] = 0;
    $meta['start_time'] = time();
    $meta['output_format'] = $outputFormat;
    $meta['output_extension'] = $extension;
    $meta['bitrate'] = $bitrate;
    file_put_contents($metaFile, json_encode($meta));

    // Start FFmpeg in background
    $concatFile = $sessionDir . 'concat.txt';
    $outputFile = $sessionDir . 'playlist.' . $extension;
    $logFile = $sessionDir . 'ffmpeg.log';

    // Prüfe ob concat.txt existiert
    if (!file_exists($concatFile)) {
        sendJsonError(400, 'Keine Dateien zum Konvertieren');
    }

    // Prüfe ob Stream-Copy möglich ist (alle Inputs = Output-Format)
    $useStreamCopy = canUseStreamCopy($sessionDir, $outputFormat);

    if ($useStreamCopy) {
        $cmd = sprintf(
            'ffmpeg -f concat -safe 0 -i %s -c:a copy -y %s > %s 2>&1 & echo $!',
            escapeshellarg($concatFile),
            escapeshellarg($outputFile),
            escapeshellarg($logFile)
        );
    } else {
        $cmd = sprintf(
            'ffmpeg -f concat -safe 0 -i %s %s %s %dk -threads 0 -y %s > %s 2>&1 & echo $!',
            escapeshellarg($concatFile),
            $ffmpegCodec,
            $bitrateFlag,
            $bitrate,
            escapeshellarg($outputFile),
            escapeshellarg($logFile)
        );
    }

    $pid = shell_exec($cmd);
    $pidValue = trim($pid ?? '');

    // Validiere dass wir eine gültige PID bekommen haben
    if (!isValidPid($pidValue)) {
        $meta['status'] = 'error';
        $meta['error'] = 'FFmpeg konnte nicht gestartet werden';
        file_put_contents($metaFile, json_encode($meta));
        sendJsonError(500, 'Konvertierung konnte nicht gestartet werden');
    }

    $meta['pid'] = intval($pidValue);
    file_put_contents($metaFile, json_encode($meta));

    echo json_encode([
        'success' => true,
        'message' => 'Konvertierung gestartet',
        'format' => $outputFormat,
        'bitrate' => $bitrate
    ]);
}

/**
 * Prüft ob Stream-Copy möglich ist (alle Input-Dateien haben dasselbe Format wie Output)
 */
function canUseStreamCopy($sessionDir, $outputFormat) {
    $concatFile = $sessionDir . 'concat.txt';
    if (!file_exists($concatFile)) {
        return false;
    }

    // Mapping: Output-Format → erwarteter Input-Codec
    $formatToCodec = [
        'mp3' => 'mp3',
        'ogg' => 'vorbis',
        'webm' => 'opus'
    ];

    $expectedCodec = $formatToCodec[$outputFormat] ?? null;
    if ($expectedCodec === null) {
        return false;
    }

    $lines = file($concatFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (preg_match("/^file '(.+)'$/", $line, $matches)) {
            $filePath = $sessionDir . $matches[1];
            if (!file_exists($filePath)) {
                return false;
            }
            $cmd = sprintf(
                'ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 %s 2>/dev/null',
                escapeshellarg($filePath)
            );
            $codec = trim(shell_exec($cmd) ?? '');
            if ($codec !== $expectedCodec) {
                return false;
            }
        }
    }

    return true;
}
