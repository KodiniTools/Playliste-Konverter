#!/usr/bin/env php
<?php
/**
 * Cleanup Script für alte Sessions
 *
 * Löscht alle Session-Ordner die älter als 1 Stunde sind.
 * Sollte als Cronjob alle 15 Minuten ausgeführt werden.
 *
 * Cronjob Beispiel:
 * */15 * * * * /usr/bin/php /var/www/kodinitools.com/playlistkonverter/backend/cleanup.php
 */

$tempDir = __DIR__ . '/temp/';
$maxAge = 3600; // 1 Stunde in Sekunden
$now = time();
$deletedCount = 0;
$errorCount = 0;

if (is_dir($tempDir) === false) {
    fwrite(STDERR, "Temp-Verzeichnis existiert nicht: " . $tempDir . "\n");
    exit(1);
}

// Durchsuche alle Unterordner
$dirs = glob($tempDir . '*', GLOB_ONLYDIR);

foreach ($dirs as $dir) {
    $parts = explode('/', $dir);
    $dirName = end($parts);

    // Überspringe spezielle Verzeichnisse
    if ($dirName === '.' || $dirName === '..') {
        continue;
    }

    // Prüfe das Alter des Ordners
    $mtime = filemtime($dir);
    $age = $now - $mtime;

    if ($age > $maxAge) {
        // Ordner ist älter als 1 Stunde - lösche ihn
        try {
            $files = glob($dir . '/*');

            // Lösche alle Dateien im Ordner
            foreach ($files as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }

            // Lösche den Ordner selbst
            rmdir($dir);

            $ageMinutes = round($age / 60);
            fwrite(STDOUT, "✓ Gelöscht: " . $dirName . " (Alter: " . $ageMinutes . " Minuten)\n");
            $deletedCount++;

        } catch (Exception $e) {
            fwrite(STDERR, "✗ Fehler beim Löschen von " . $dirName . ": " . $e->getMessage() . "\n");
            $errorCount++;
        }
    }
}

fwrite(STDOUT, "\n=== Cleanup abgeschlossen ===\n");
fwrite(STDOUT, "Sessions gelöscht: " . $deletedCount . "\n");
fwrite(STDOUT, "Fehler: " . $errorCount . "\n");
fwrite(STDOUT, "Verbleibende Sessions: " . (count($dirs) - $deletedCount) . "\n");

exit($errorCount > 0 ? 1 : 0);
