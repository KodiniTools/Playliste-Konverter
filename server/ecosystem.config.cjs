/**
 * pm2-Konfiguration für den Playlist-Konverter-Dienst.
 *
 * Start:
 *   cd /opt/playliste-konverter/server
 *   npm ci --omit=dev
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Logs:  pm2 logs playlistkonverter-server
 * Status: pm2 list
 */
module.exports = {
  apps: [
    {
      name: 'playlistkonverter-server',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 9016,
        // Optional: eigenes Temp-Verzeichnis (Standard: <server>/temp)
        // TEMP_DIR: '/var/www/kodinitools.com/playlistkonverter/server-temp',
        // Gleichzeitige Konvertierungen. Je Job laufen ein Decoder und ein Encoder
        // (~1–2 Kerne); 4 passt zu 8 Kernen und lässt Luft für die übrigen Tools.
        MAX_CONCURRENT: 4,
        // Gleichzeitige Track-Encoder über ALLE Konvertierungen (MP3, parallel.js).
        // 6 von 8 Kernen; 1 schaltet das parallele Kodieren ab.
        MAX_PARALLEL_ENCODES: 6,
        // Gesamtgröße pro Sitzung (wie MAX_PLAYLIST_SIZE der App, src/constants.js)
        MAX_PLAYLIST_SIZE: '5G',
        // Freier Platz, der auf der Partition des Temp-Ordners immer bleiben muss
        MIN_FREE_SPACE: '20G',
      },
    },
  ],
}
