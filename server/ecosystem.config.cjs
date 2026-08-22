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
        MAX_CONCURRENT: 3,
      },
    },
  ],
}
