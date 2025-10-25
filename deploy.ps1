# Deploy Script für Playlist Konverter
# Ausführen mit: .\deploy.ps1

Write-Host "=== Playlist Konverter Deployment ===" -ForegroundColor Cyan

# 1. Frontend bauen
Write-Host "`n[1/4] Frontend bauen..." -ForegroundColor Yellow
npm install
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# 2. Frontend hochladen
Write-Host "`n[2/4] Frontend hochladen..." -ForegroundColor Yellow
scp -r dist/* root@145.223.81.100:/var/www/kodinitools.com/playlistkonverter/

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend-Upload fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# 3. Backend hochladen
Write-Host "`n[3/4] Backend hochladen..." -ForegroundColor Yellow
scp -r backend root@145.223.81.100:/var/www/kodinitools.com/playlistkonverter/

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend-Upload fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# 4. Server-Befehle ausführen
Write-Host "`n[4/4] Server-Konfiguration prüfen..." -ForegroundColor Yellow
ssh root@145.223.81.100 @"
    # Temp-Rechte setzen
    chown -R www-data:www-data /var/www/kodinitools.com/playlistkonverter/backend/temp
    chmod 755 /var/www/kodinitools.com/playlistkonverter/backend/temp
    
    # FFmpeg prüfen
    echo 'FFmpeg Version:'
    ffmpeg -version | head -n 1
    
    # Nginx testen
    nginx -t
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Server-Konfiguration fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Deployment erfolgreich! ===" -ForegroundColor Green
Write-Host "URL: https://kodinitools.com/playlistkonverter/" -ForegroundColor Cyan
