'use strict'

/** In-Memory-Sessions und Dateisystem-Helfer rund um den Sitzungsordner. */
const fsp = require('fs/promises')
const path = require('path')
const { TEMP_DIR } = require('./config')

function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)
}

function sanitizeFilename(name) {
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sessionDirPath(sessionId) {
  return path.join(TEMP_DIR, sessionId)
}

/** In-Memory-Zustand aller bekannten Sessions. */
const sessions = new Map()

/**
 * Abgebrochene Session-IDs (→ Zeitpunkt). Ein Upload, der beim Abbrechen noch
 * unterwegs war, darf die Session nicht neu anlegen.
 */
const cancelledIds = new Map()

/** Alle Input-Dateien einer Session in korrekter Reihenfolge (0000_, 0001_, …). */
async function listInputFiles(dir) {
  let entries
  try {
    entries = await fsp.readdir(dir)
  } catch {
    return []
  }
  return entries
    .filter((f) => /^\d{4}_/.test(f))
    .sort()
    .map((f) => path.join(dir, f))
}

async function safeUnlink(p) {
  try {
    await fsp.unlink(p)
  } catch {
    /* ignore */
  }
}

async function cleanupTmpUploads(files) {
  await Promise.all((files || []).map((f) => safeUnlink(f.path)))
}

module.exports = {
  sessions,
  cancelledIds,
  isValidSessionId,
  sanitizeFilename,
  sessionDirPath,
  listInputFiles,
  safeUnlink,
  cleanupTmpUploads,
}
