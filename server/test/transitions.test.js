'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Readable, Writable } = require('node:stream')
const {
  PcmJoiner,
  sanitizeTransition,
  outputDuration,
  crossfade,
  FRAME_BYTES,
} = require('../transitions')

const RATE = 10 // 10 Frames pro Sekunde: kleine, gut prüfbare Puffer

/** PCM-Track: frames Stereo-Frames mit konstantem Wert, in Chunks zerlegt. */
function track(frames, value, chunkBytes = 12) {
  const buf = Buffer.alloc(frames * FRAME_BYTES)
  for (let i = 0; i < frames * 2; i++) buf.writeFloatLE(value, i * 4)
  const chunks = []
  for (let i = 0; i < buf.length; i += chunkBytes) chunks.push(buf.subarray(i, i + chunkBytes))
  return Readable.from(chunks)
}

function collector() {
  const parts = []
  const sink = new Writable({
    write(chunk, _enc, cb) {
      parts.push(Buffer.from(chunk))
      cb()
    },
  })
  const samples = () => {
    const all = Buffer.concat(parts)
    const out = []
    for (let i = 0; i < all.length; i += 4) out.push(Math.round(all.readFloatLE(i) * 1000) / 1000)
    return out
  }
  return { sink, samples }
}

async function join(transition, tracks) {
  const { sink, samples } = collector()
  const joiner = new PcmJoiner(sink, { sampleRate: RATE, transition })
  for (const t of tracks) await joiner.addTrack(t)
  await joiner.finish()
  return samples()
}

test('sanitizeTransition: unbekannt → keiner, Sekunden begrenzt und gerundet', () => {
  assert.deepEqual(sanitizeTransition('wipe', 3), { type: 'none', seconds: 0 })
  assert.deepEqual(sanitizeTransition(undefined), { type: 'none', seconds: 0 })
  assert.deepEqual(sanitizeTransition('gap', 1.3), { type: 'gap', seconds: 1.5 })
  assert.deepEqual(sanitizeTransition('crossfade', 99), { type: 'crossfade', seconds: 10 })
  assert.deepEqual(sanitizeTransition('gap', 0), { type: 'gap', seconds: 0.5 })
  assert.deepEqual(sanitizeTransition('gap', 'abc'), { type: 'gap', seconds: 2 })
})

test('ohne Übergang werden die Tracks unverändert aneinandergehängt', async () => {
  const out = await join({ type: 'none', seconds: 0 }, [track(3, 1), track(2, 0.5)])
  assert.deepEqual(out, [1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5])
})

test('Pause: Stille nur zwischen den Tracks', async () => {
  const out = await join({ type: 'gap', seconds: 0.2 }, [track(1, 1), track(1, 0.5), track(1, 1)])
  assert.deepEqual(out, [1, 1, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 1, 1])
})

test('Crossfade: Länge verkürzt sich je Übergang, Mitte gleiche Leistung', async () => {
  const out = await join({ type: 'crossfade', seconds: 0.2 }, [track(5, 1), track(5, 1)])
  // 5 + 5 Frames − 2 überblendete Frames = 8 Frames
  assert.equal(out.length, 8 * 2)
  // Bei gleichem Signal liegt die Summe cos+sin über 1 (gleiche Leistung)
  assert.ok(out.every((v) => v >= 1 - 1e-6))
  assert.deepEqual(out.slice(0, 6), [1, 1, 1, 1, 1, 1])
})

test('Crossfade: Ausgang blendet aus, Eingang blendet ein', () => {
  const frames = 4
  const fadeOut = Buffer.alloc(frames * FRAME_BYTES)
  for (let i = 0; i < frames * 2; i++) fadeOut.writeFloatLE(1, i * 4)
  const mixed = crossfade(fadeOut, Buffer.alloc(frames * FRAME_BYTES))
  const left = [0, 1, 2, 3].map((f) => mixed.readFloatLE(f * FRAME_BYTES))
  assert.ok(left[0] > 0.95 && left[3] < 0.25)
  assert.ok(left.every((v, i) => i === 0 || v < left[i - 1]))
})

test('Crossfade mit kürzerem Folgetrack verliert keine Samples', async () => {
  const out = await join({ type: 'crossfade', seconds: 0.3 }, [
    track(6, 1),
    track(1, 0.5),
    track(4, 0.25),
  ])
  // Track 2 (1 Frame) liegt ganz in der Ausblendung von Track 1 und wird nicht
  // weiter überblendet: 6 + 1 + 4 − 1 überlappender Frame = 10 Frames
  assert.equal(out.length, 10 * 2)
  assert.deepEqual(out.slice(-2), [0.25, 0.25])
})

test('outputDuration berücksichtigt Pausen und Überblendungen', () => {
  assert.equal(outputDuration([2, 2, 2], { type: 'none', seconds: 0 }), 6)
  assert.equal(outputDuration([2, 2, 2], { type: 'gap', seconds: 1 }), 8)
  assert.equal(outputDuration([2, 2, 2], { type: 'crossfade', seconds: 1 }), 4)
  assert.equal(outputDuration([], { type: 'gap', seconds: 1 }), 0)
})
