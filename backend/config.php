<?php
/**
 * Backend-Konfiguration
 */

return [
    // Queue-System aktivieren?
    // true = Konvertierungen werden in Queue eingereiht
    // false = Konvertierungen laufen direkt (wie vorher)
    'use_queue' => false,

    // Maximale Anzahl gleichzeitiger Konvertierungen (nur bei use_queue = true)
    'max_concurrent_jobs' => 3,

    // Maximales Alter für Session-Cleanup in Sekunden
    'cleanup_max_age' => 3600, // 1 Stunde
];
