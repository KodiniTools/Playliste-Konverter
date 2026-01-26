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

    // Unterstützte Ausgabeformate
    'output_formats' => [
        'webm' => [
            'extension' => 'webm',
            'mime_type' => 'audio/webm',
            'ffmpeg_codec' => '-c:a libopus -b:a 128k',
            'label' => 'WebM (Opus)'
        ],
        'mp3' => [
            'extension' => 'mp3',
            'mime_type' => 'audio/mpeg',
            'ffmpeg_codec' => '-c:a libmp3lame -b:a 192k -q:a 2',
            'label' => 'MP3'
        ],
        'ogg' => [
            'extension' => 'ogg',
            'mime_type' => 'audio/ogg',
            'ffmpeg_codec' => '-c:a libvorbis -b:a 192k',
            'label' => 'OGG (Vorbis)'
        ]
    ],

    // Standard-Ausgabeformat
    'default_format' => 'webm'
];
