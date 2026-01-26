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

    // Verfügbare Bitraten (in kbps)
    'available_bitrates' => [64, 128, 192, 256, 320],
    'default_bitrate' => 192,

    // Unterstützte Ausgabeformate
    'output_formats' => [
        'webm' => [
            'extension' => 'webm',
            'mime_type' => 'audio/webm',
            'ffmpeg_codec' => '-c:a libopus',
            'bitrate_flag' => '-b:a',
            'label' => 'WebM (Opus)',
            'max_bitrate' => 256 // Opus unterstützt max 256k effektiv
        ],
        'mp3' => [
            'extension' => 'mp3',
            'mime_type' => 'audio/mpeg',
            'ffmpeg_codec' => '-c:a libmp3lame',
            'bitrate_flag' => '-b:a',
            'label' => 'MP3',
            'max_bitrate' => 320
        ],
        'ogg' => [
            'extension' => 'ogg',
            'mime_type' => 'audio/ogg',
            'ffmpeg_codec' => '-c:a libvorbis',
            'bitrate_flag' => '-b:a',
            'label' => 'OGG (Vorbis)',
            'max_bitrate' => 320
        ]
    ],

    // Standard-Ausgabeformat
    'default_format' => 'webm'
];
