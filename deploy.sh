#!/usr/bin/env bash
#
# Deploy-Script für den Playlist Konverter (Server-seitig).
#
# Baut direkt aus dem aktuellen main-Branch und spielt das Ergebnis in den
# Webroot-Ordner aus. Gedacht zum Ausführen AUF dem Server in einem
# Git-Checkout dieses Repositories, z. B.:
#
#   cd /opt/playliste-konverter        # Git-Checkout (nicht der Webroot!)
#   ./deploy.sh
#
# Ablauf:
#   1. Auf den neuesten Stand von origin/main aktualisieren
#   2. Frontend bauen (npm ci && npm run build)
#   3. Frontend (dist/) in den Webroot synchronisieren
#   4. Backend (PHP) in den Webroot synchronisieren – Sessions in temp/ bleiben erhalten
#   5. Rechte für backend/temp setzen
#   6. Nginx-Konfiguration testen und neu laden
#
# Überschreibbare Einstellungen via Umgebungsvariablen:
#   DEPLOY_DIR    Ziel-/Webroot-Verzeichnis (Standard: /var/www/kodinitools.com/playlistkonverter)
#   DEPLOY_BRANCH Zu deployender Branch (Standard: main)
#   WEB_USER      Besitzer für backend/temp (Standard: www-data)
#   RELOAD_NGINX  "1" = Nginx testen & neu laden, "0" = überspringen (Standard: 1)
#
set -euo pipefail

# --- Konfiguration ---------------------------------------------------------
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/kodinitools.com/playlistkonverter}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
WEB_USER="${WEB_USER:-www-data}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"

# Farben (nur wenn Terminal)
if [ -t 1 ]; then
  C_CYAN='\033[0;36m'; C_YELLOW='\033[1;33m'; C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_CYAN=''; C_YELLOW=''; C_GREEN=''; C_RED=''; C_RESET=''
fi

step() { echo -e "\n${C_YELLOW}$1${C_RESET}"; }
info() { echo -e "${C_CYAN}$1${C_RESET}"; }
fail() { echo -e "${C_RED}$1${C_RESET}" >&2; exit 1; }

# In das Verzeichnis dieses Scripts wechseln (= Git-Checkout)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${C_CYAN}=== Playlist Konverter Deployment ===${C_RESET}"
info "Checkout : $SCRIPT_DIR"
info "Branch   : $DEPLOY_BRANCH"
info "Ziel     : $DEPLOY_DIR"

# --- Vorbedingungen prüfen -------------------------------------------------
command -v git  >/dev/null 2>&1 || fail "git ist nicht installiert."
command -v npm  >/dev/null 2>&1 || fail "npm ist nicht installiert."
command -v rsync >/dev/null 2>&1 || fail "rsync ist nicht installiert (apt install rsync)."
[ -d "$SCRIPT_DIR/.git" ] || fail "Kein Git-Checkout: $SCRIPT_DIR"

# --- 1. Auf neuesten main-Stand bringen ------------------------------------
step "[1/6] Aktualisiere auf origin/$DEPLOY_BRANCH ..."
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
# Deterministischer Stand: exakt origin/main (verwirft lokale Änderungen im Checkout)
git reset --hard "origin/$DEPLOY_BRANCH"
info "Aktueller Commit: $(git rev-parse --short HEAD) – $(git log -1 --pretty=%s)"

# --- 2. Frontend bauen -----------------------------------------------------
step "[2/6] Frontend bauen ..."
npm ci
npm run build
[ -d dist ] || fail "Build-Ausgabe 'dist/' nicht gefunden."

# --- 3. Frontend deployen --------------------------------------------------
step "[3/6] Frontend nach Webroot synchronisieren ..."
mkdir -p "$DEPLOY_DIR"
# --delete entfernt veraltete (gehashte) Asset-Dateien; backend/ wird per
# Exclude vor Löschung geschützt, damit Backend & Sessions unangetastet bleiben.
rsync -a --delete \
  --exclude '/backend' \
  --exclude '/backend/**' \
  dist/ "$DEPLOY_DIR/"

# --- 4. Backend deployen ---------------------------------------------------
step "[4/6] Backend nach Webroot synchronisieren ..."
# Hochgeladene/laufende Sessions in temp/ nicht überschreiben oder löschen.
mkdir -p "$DEPLOY_DIR/backend"
rsync -a --delete \
  --exclude 'temp/***' \
  backend/ "$DEPLOY_DIR/backend/"

# --- 5. Rechte für temp ----------------------------------------------------
step "[5/6] Rechte für backend/temp setzen ..."
mkdir -p "$DEPLOY_DIR/backend/temp"
if chown -R "$WEB_USER:$WEB_USER" "$DEPLOY_DIR/backend/temp" 2>/dev/null; then
  chmod 755 "$DEPLOY_DIR/backend/temp"
  info "Besitzer $WEB_USER gesetzt."
else
  echo -e "${C_YELLOW}Hinweis: chown übersprungen (keine Rechte). Ggf. mit sudo ausführen.${C_RESET}"
fi

# --- 6. Nginx neu laden ----------------------------------------------------
step "[6/6] Nginx testen & neu laden ..."
if [ "$RELOAD_NGINX" = "1" ] && command -v nginx >/dev/null 2>&1; then
  if nginx -t; then
    if command -v systemctl >/dev/null 2>&1; then
      systemctl reload nginx && info "Nginx neu geladen."
    else
      nginx -s reload && info "Nginx neu geladen."
    fi
  else
    fail "nginx -t fehlgeschlagen – Konfiguration prüfen. Deployment NICHT neu geladen."
  fi
else
  info "Nginx-Reload übersprungen."
fi

echo -e "\n${C_GREEN}=== Deployment erfolgreich! ===${C_RESET}"
info "URL: https://kodinitools.com/playlistkonverter/"
