'use strict'

/** Sessions beenden und aufräumen (Abbruch, Download, Alter). */
const fsp = require('fs/promises')
const path = require('path')
const { TEMP_DIR, SESSION_MAX_AGE } = require('./config')
const { sessions, cancelledIds, sessionDirPath } = require('./sessions')
const { dequeue } = require('./queue')

async function removeSession(sessionId) {
  const session = sessions.get(sessionId)
  if (session) session.cancelled = true
  for (const proc of [session?.decoder, session?.proc]) {
    if (!proc) continue
    try {
      proc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
  sessions.delete(sessionId)
  dequeue(sessionId)
  await fsp.rm(sessionDirPath(sessionId), { recursive: true, force: true }).catch(() => {})
}

/** Periodischer Cleanup: alte Sessions (> 1 h) entfernen. */
async function periodicCleanup() {
  const now = Date.now()
  for (const [id, cancelledAt] of cancelledIds) {
    if (now - cancelledAt > SESSION_MAX_AGE) cancelledIds.delete(id)
  }
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE) {
      await removeSession(id)
    }
  }
  // Verwaiste Verzeichnisse (z. B. nach Neustart) ebenfalls entfernen.
  try {
    const dirs = await fsp.readdir(TEMP_DIR, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      if (sessions.has(d.name)) continue
      const full = path.join(TEMP_DIR, d.name)
      try {
        const stat = await fsp.stat(full)
        if (now - stat.mtimeMs > SESSION_MAX_AGE) {
          await fsp.rm(full, { recursive: true, force: true })
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

module.exports = { removeSession, periodicCleanup }
