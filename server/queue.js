'use strict'

/** Job-Queue im Prozess mit Begrenzung gleichzeitiger ffmpeg-Läufe. */
const { MAX_CONCURRENT } = require('./config')
const { sessions } = require('./sessions')
const { runConversion } = require('./conversion')

// --- Concurrency-Limiter (max. gleichzeitige ffmpeg-Prozesse) --------------
let running = 0
const waiting = []
function acquireSlot() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running++
      resolve()
    } else {
      waiting.push(resolve)
    }
  })
}
function releaseSlot() {
  running = Math.max(0, running - 1)
  if (waiting.length > 0 && running < MAX_CONCURRENT) {
    running++
    const next = waiting.shift()
    next()
  }
}

// --- Job-Queue ------------------------------------------------------------
const jobQueue = []
function enqueueJob(session) {
  session.status = 'queued'
  session.progress = 0
  jobQueue.push(session.id)
  processQueue()
}

function processQueue() {
  if (jobQueue.length === 0) return
  if (running >= MAX_CONCURRENT) return
  const sessionId = jobQueue.shift()
  const session = sessions.get(sessionId)
  if (!session) {
    processQueue()
    return
  }
  // runConversion fängt alle Fehler selbst; Slot danach freigeben, nächsten Job starten
  acquireSlot()
    .then(() => runConversion(session))
    .finally(() => {
      releaseSlot()
      processQueue()
    })
}

/** Session aus der Warteschlange nehmen (falls sie noch wartet). */
function dequeue(sessionId) {
  const idx = jobQueue.indexOf(sessionId)
  if (idx >= 0) jobQueue.splice(idx, 1)
}

/** 1-basierte Position in der Warteschlange, 0 wenn nicht (mehr) wartend. */
function queuePosition(sessionId) {
  return jobQueue.indexOf(sessionId) + 1
}

function queueStats() {
  return { running, queued: jobQueue.length }
}

module.exports = { enqueueJob, dequeue, queuePosition, queueStats }
