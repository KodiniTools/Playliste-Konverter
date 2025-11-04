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

if (!is_dir($tempDir)) {
    echo "Temp-Verzeichnis existiert nicht: $tempDir\n";
    exit(1);
}

// Durchsuche alle Unterordner
$dirs = glob($tempDir . '*', GLOB_ONLYDIR);

foreach ($dirs as $dir) {
    $dirName = basename($dir);

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
            echo "✓ Gelöscht: $dirName (Alter: $ageMinutes Minuten)\n";
            $deletedCount++;

        } catch (Exception $e) {
            echo "✗ Fehler beim Löschen von $dirName: " . $e->getMessage() . "\n";
            $errorCount++;
        }
    }
}

echo "\n=== Cleanup abgeschlossen ===\n";
echo "Sessions gelöscht: $deletedCount\n";
echo "Fehler: $errorCount\n";
echo "Verbleibende Sessions: " . (count($dirs) - $deletedCount) . "\n";

exit($errorCount > 0 ? 1 : 0);
