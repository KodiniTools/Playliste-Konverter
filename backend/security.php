<?php
/**
 * Zentrale Sicherheitsfunktionen für das Backend
 */

/**
 * Setzt sichere HTTP-Header für alle API-Responses
 */
function setSecurityHeaders() {
    // Verhindere MIME-Type-Sniffing
    header('X-Content-Type-Options: nosniff');

    // Verhindere Clickjacking
    header('X-Frame-Options: DENY');

    // XSS-Schutz (für ältere Browser)
    header('X-XSS-Protection: 1; mode=block');

    // Referrer Policy
    header('Referrer-Policy: strict-origin-when-cross-origin');

    // Cache-Control für API-Responses
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}

/**
 * Setzt CORS-Header für API-Requests
 * @param array $allowedMethods Erlaubte HTTP-Methoden
 */
function setCorsHeaders($allowedMethods = ['GET', 'POST', 'OPTIONS']) {
    // CORS - für Entwicklung * erlaubt, in Produktion einschränken
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . implode(', ', $allowedMethods));
    header('Access-Control-Allow-Headers: Content-Type');
}

/**
 * Validiert eine Session-ID
 * @param string $sessionId Die zu validierende Session-ID
 * @return bool True wenn gültig
 */
function isValidSessionId($sessionId) {
    return !empty($sessionId) && preg_match('/^[a-f0-9]{32}$/', $sessionId);
}

/**
 * Validiert eine Prozess-ID (PID)
 * @param mixed $pid Die zu validierende PID
 * @return bool True wenn gültig
 */
function isValidPid($pid) {
    // PID muss eine positive Ganzzahl sein
    if (!is_numeric($pid)) {
        return false;
    }
    $pidInt = intval($pid);
    return $pidInt > 0 && $pidInt <= 4194304; // Max PID auf Linux
}

/**
 * Validiert eine Dateiendung
 * @param string $extension Die zu validierende Endung
 * @param array $allowed Erlaubte Endungen
 * @return bool True wenn gültig
 */
function isValidExtension($extension, $allowed = ['webm', 'mp3', 'ogg']) {
    return in_array(strtolower($extension), $allowed, true);
}

/**
 * Validiert eine Bitrate
 * @param mixed $bitrate Die zu validierende Bitrate
 * @param array $allowed Erlaubte Bitraten
 * @return bool True wenn gültig
 */
function isValidBitrate($bitrate, $allowed = [64, 128, 192, 256, 320]) {
    return is_numeric($bitrate) && in_array(intval($bitrate), $allowed, true);
}

/**
 * Sanitiert einen Dateinamen
 * @param string $filename Der zu sanitierende Dateiname
 * @return string Der sanitierte Dateiname
 */
function sanitizeFilename($filename) {
    // Entferne Pfad-Komponenten
    $filename = basename($filename);
    // Ersetze unsichere Zeichen
    return preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
}

/**
 * Prüft ob ein Prozess läuft (sicher)
 * @param int $pid Die Prozess-ID
 * @return bool True wenn der Prozess läuft
 */
function isProcessRunning($pid) {
    if (!isValidPid($pid)) {
        return false;
    }
    // Sichere Methode: /proc Dateisystem prüfen
    return file_exists('/proc/' . intval($pid));
}

/**
 * Validiert dass ein Pfad innerhalb eines erlaubten Verzeichnisses liegt
 * @param string $path Der zu prüfende Pfad
 * @param string $allowedBase Das erlaubte Basisverzeichnis
 * @return bool True wenn der Pfad gültig ist
 */
function isPathWithinBase($path, $allowedBase) {
    $realPath = realpath($path);
    $realBase = realpath($allowedBase);

    if ($realPath === false || $realBase === false) {
        return false;
    }

    return strpos($realPath, $realBase) === 0;
}

/**
 * Sendet eine JSON-Fehlerantwort und beendet das Skript
 * @param int $code HTTP-Statuscode
 * @param string $message Fehlermeldung
 */
function sendJsonError($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

/**
 * Loggt einen Sicherheitsvorfall
 * @param string $type Typ des Vorfalls
 * @param array $details Details zum Vorfall
 */
function logSecurityEvent($type, $details = []) {
    $logDir = __DIR__ . '/logs/';
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }

    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'type' => $type,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'details' => $details
    ];

    $logFile = $logDir . 'security_' . date('Y-m-d') . '.log';
    file_put_contents($logFile, json_encode($logEntry) . "\n", FILE_APPEND | LOCK_EX);
}
