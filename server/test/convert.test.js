'use strict'

/**
 * Ende-zu-Ende: echter Server, echte ffmpeg-Läufe. Gemischte Eingaben (MP3/WAV,
 * 44,1/48 kHz, Mono/Stereo, 16/24 Bit) müssen VOLLSTÄNDIG und in der richtigen
 * Reihenfolge in der Ausgabe landen. Jeder Track hat einen eigenen Ton; geprüft
 * werden Gesamtdauer und die Tonhöhe jedes Abschnitts.
 * Wird übersprungen, wenn ffmpeg/ffprobe nicht installiert sind.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

const SERVER = path.join(__dirname, '..', 'server.js')
const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const SECONDS = 2

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  if (r.status !== 0) throw new Error(r.stderr.toString())
}

/** Testdatei mit Sinuston erzeugen. */
function makeTrack(dir, name, { freq, ext, rate = 44100, channels = 2, codec, args = [] }) {
  const file = path.join(dir, name)
  const audioCodec = codec || (ext === 'mp3' ? 'libmp3lame' : 'pcm_s16le')
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:sample_rate=${rate}:duration=${SECONDS}`,
    '-ac',
    String(channels),
    '-c:a',
    audioCodec,
    ...(ext === 'mp3' ? ['-b:a', '192k'] : []),
    ...args,
    file,
  ])
  return file
}

function duration(file) {
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return parseFloat(r.stdout.toString())
}

/** Dominante Frequenz je Abschnitt über Nulldurchgänge (Mono, 8 kHz). */
function segmentFrequencies(file, count) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2)
  const seg = 8000 * SECONDS
  const result = []
  for (let i = 0; i < count; i++) {
    // Ränder auslassen (Encoder-Versatz, Übergänge)
    const from = i * seg + 2000
    const to = (i + 1) * seg - 2000
    let crossings = 0
    for (let j = from + 1; j < Math.min(to, pcm.length); j++) {
      if (pcm[j - 1] < 0 !== pcm[j] < 0) crossings++
    }
    result.push(Math.round(crossings / 2 / ((to - from) / 8000)))
  }
  return result
}

async function startServer(tempDir) {
  const port = await freePort()
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), TEMP_DIR: tempDir, MIN_FREE_SPACE: '0' },
    stdio: 'ignore',
  })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break
    } catch {
      /* startet noch */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return { base, stop: () => proc.kill('SIGKILL') }
}

/** Wie die App: eine Datei pro Request, dann convert, Status pollen, download. */
async function convertViaServer(base, files, format = 'mp3', bitrate = 192, extra = {}) {
  let sessionId
  for (let i = 0; i < files.length; i++) {
    const form = new FormData()
    form.append('files[]', new Blob([fs.readFileSync(files[i])]), path.basename(files[i]))
    form.append('order[]', String(i))
    form.append('chunk_index', String(i))
    if (sessionId) form.append('session_id', sessionId)
    const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form })
    assert.equal(res.status, 200)
    sessionId = (await res.json()).session_id
  }
  const conv = await fetch(`${base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format, bitrate, ...extra }),
  })
  assert.equal(conv.status, 200)
  let status
  for (let i = 0; i < 300; i++) {
    status = await (await fetch(`${base}/api/status/${sessionId}`)).json()
    if (status.status === 'done' || status.status === 'error') break
    await new Promise((r) => setTimeout(r, 100))
  }
  return { sessionId, status }
}

async function download(base, sessionId, target) {
  const res = await fetch(`${base}/api/download/${sessionId}`)
  assert.equal(res.status, 200)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  return target
}

test(
  'gemischte MP3/WAV-Playlist: alle Tracks vollständig und in Reihenfolge',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-conv-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    // Muster aus der Fehlermeldung: MP3, MP3, MP3, WAV, WAV, MP3, WAV … plus Varianten
    const specs = [
      { ext: 'mp3' },
      { ext: 'mp3' },
      { ext: 'mp3' },
      { ext: 'wav' },
      { ext: 'wav', rate: 48000, codec: 'pcm_s24le' },
      { ext: 'mp3' },
      { ext: 'wav', channels: 1 },
      { ext: 'mp3', rate: 48000 },
      { ext: 'wav', rate: 22050 },
      { ext: 'mp3' },
    ]
    const freqs = specs.map((_, i) => 300 + i * 100)
    const files = specs.map((spec, i) =>
      makeTrack(work, `track${String(i).padStart(2, '0')}.${spec.ext}`, {
        ...spec,
        freq: freqs[i],
      }),
    )
    const inputTotal = files.reduce((sum, f) => sum + duration(f), 0)

    const { sessionId, status } = await convertViaServer(srv.base, files)
    assert.equal(status.status, 'done', JSON.stringify(status))

    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    const outDuration = duration(out)
    assert.ok(
      Math.abs(outDuration - inputTotal) < 0.5,
      `Ausgabe ${outDuration}s, Eingaben ${inputTotal}s`,
    )

    const measured = segmentFrequencies(out, files.length)
    measured.forEach((f, i) =>
      assert.ok(Math.abs(f - freqs[i]) <= 15, `Track ${i + 1}: ${f} Hz statt ${freqs[i]} Hz`),
    )
  },
)

test(
  'identische MP3s laufen weiter verlustfrei per Stream-Copy',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-copy-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const files = [0, 1, 2].map((i) =>
      makeTrack(work, `t${i}.mp3`, { ext: 'mp3', freq: 400 + i * 200 }),
    )
    const inputBytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const { sessionId, status } = await convertViaServer(srv.base, files, 'mp3', 192)
    assert.equal(status.status, 'done')
    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    // Stream-Copy: Ausgabe ≈ Summe der Eingaben (keine Neukodierung)
    assert.ok(
      Math.abs(fs.statSync(out).size - inputBytes) < 4096,
      'Ausgabe sollte kopiert, nicht neu kodiert sein',
    )
    assert.deepEqual(
      segmentFrequencies(out, 3).map((f) => Math.round(f / 100) * 100),
      [400, 600, 800],
    )
  },
)

test(
  'N1: FLAC, M4A, AAC, OGG und OPUS gemischt: vollständig und in Reihenfolge',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-n1-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const files = [
      makeTrack(work, 'a.flac', { ext: 'flac', freq: 400, codec: 'flac' }),
      makeTrack(work, 'b.m4a', { ext: 'm4a', freq: 600, codec: 'aac', rate: 48000 }),
      makeTrack(work, 'c.aac', { ext: 'aac', freq: 800, codec: 'aac' }),
      makeTrack(work, 'd.ogg', { ext: 'ogg', freq: 1000, codec: 'libvorbis', channels: 1 }),
      makeTrack(work, 'e.opus', { ext: 'opus', freq: 1200, codec: 'libopus', rate: 48000 }),
    ]
    const { sessionId, status } = await convertViaServer(srv.base, files, 'mp3', 192)
    assert.equal(status.status, 'done', JSON.stringify(status))
    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    assert.ok(Math.abs(duration(out) - 5 * SECONDS) < 0.5, `Dauer ${duration(out)}`)
    assert.deepEqual(
      segmentFrequencies(out, 5).map((f) => Math.round(f / 100) * 100),
      [400, 600, 800, 1000, 1200],
    )
  },
)

test(
  'N1: mehrere OGG-Vorbis-Dateien → OGG werden neu kodiert (kein kaputtes Stream-Copy)',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-ogg-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    // Unterschiedliche Qualität → unterschiedliche Vorbis-Header; per Stream-Copy
    // wäre der zweite Track danach nur noch Rauschen bzw. Stille
    const files = [
      makeTrack(work, 'v0.ogg', { ext: 'ogg', freq: 500, codec: 'libvorbis', args: ['-q:a', '0'] }),
      makeTrack(work, 'v1.ogg', { ext: 'ogg', freq: 900, codec: 'libvorbis', args: ['-q:a', '9'] }),
    ]
    const { sessionId, status } = await convertViaServer(srv.base, files, 'ogg', 128)
    assert.equal(status.status, 'done', JSON.stringify(status))
    const out = await download(srv.base, sessionId, path.join(work, 'out.ogg'))
    assert.ok(Math.abs(duration(out) - 2 * SECONDS) < 0.5, `Dauer ${duration(out)}`)
    assert.deepEqual(
      segmentFrequencies(out, 2).map((f) => Math.round(f / 100) * 100),
      [500, 900],
    )
  },
)

function channels(file) {
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=channels',
    '-of',
    'csv=p=0',
    file,
  ])
  return parseInt(r.stdout.toString(), 10)
}

test(
  'N11: Mono-Ausgabe auf Wunsch, auch bei identischen Stereo-MP3s (kein Stream-Copy)',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-mono-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const files = [0, 1].map((i) =>
      makeTrack(work, `s${i}.mp3`, { ext: 'mp3', freq: 500 + i * 300 }),
    )
    const mono = await convertViaServer(srv.base, files, 'mp3', 64, { channels: 1 })
    assert.equal(mono.status.status, 'done', JSON.stringify(mono.status))
    const monoOut = await download(srv.base, mono.sessionId, path.join(work, 'mono.mp3'))
    assert.equal(channels(monoOut), 1)
    assert.deepEqual(
      segmentFrequencies(monoOut, 2).map((f) => Math.round(f / 100) * 100),
      [500, 800],
    )

    const stereo = await convertViaServer(srv.base, files, 'mp3', 192)
    const stereoOut = await download(srv.base, stereo.sessionId, path.join(work, 'stereo.mp3'))
    assert.equal(channels(stereoOut), 2)
  },
)

function probeJson(file) {
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format_tags:stream=codec_type,codec_name:stream_disposition=attached_pic',
    '-of',
    'json',
    file,
  ])
  return JSON.parse(r.stdout.toString())
}

for (const [label, inputs] of [
  ['Neukodierung', ['wav', 'mp3']],
  ['Stream-Copy', ['mp3', 'mp3']],
]) {
  test(
    `N6: Dateiname, Tags und Cover (${label})`,
    { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
    async (t) => {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-tags-'))
      const srv = await startServer(path.join(work, 'temp'))
      t.after(() => {
        srv.stop()
        fs.rmSync(work, { recursive: true, force: true })
      })

      const files = inputs.map((ext, i) =>
        // Tags der Eingaben dürfen nicht in der Playlist landen
        makeTrack(work, `t${i}.${ext}`, {
          ext,
          freq: 500 + i * 300,
          args: ['-metadata', 'genre=Vom ersten Track'],
        }),
      )
      const cover = path.join(work, 'cover.png')
      ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', cover])

      // Session anlegen: Dateien hochladen, Cover nachreichen, dann konvertieren
      let sessionId
      for (let i = 0; i < files.length; i++) {
        const form = new FormData()
        form.append('files[]', new Blob([fs.readFileSync(files[i])]), path.basename(files[i]))
        form.append('order[]', String(i))
        if (sessionId) form.append('session_id', sessionId)
        sessionId = (
          await (await fetch(`${srv.base}/api/upload`, { method: 'POST', body: form })).json()
        ).session_id
      }
      const coverForm = new FormData()
      coverForm.append('cover', new Blob([fs.readFileSync(cover)]), 'Cover.PNG')
      const coverRes = await fetch(`${srv.base}/api/cover/${sessionId}`, {
        method: 'POST',
        body: coverForm,
      })
      assert.equal(coverRes.status, 200)

      const conv = await fetch(`${srv.base}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          format: 'mp3',
          bitrate: 192,
          filename: 'Sommer Mix – 2026',
          tags: { title: 'Sommer Mix', artist: 'Kodini', album: 'Mixe' },
        }),
      })
      assert.equal(conv.status, 200)
      let status
      for (let i = 0; i < 300; i++) {
        status = await (await fetch(`${srv.base}/api/status/${sessionId}`)).json()
        if (status.status === 'done' || status.status === 'error') break
        await new Promise((r) => setTimeout(r, 100))
      }
      assert.equal(status.status, 'done', JSON.stringify(status))

      const res = await fetch(`${srv.base}/api/download/${sessionId}`)
      assert.match(
        res.headers.get('content-disposition'),
        /filename\*=UTF-8''Sommer%20Mix%20%E2%80%93%202026\.mp3/,
      )
      const out = path.join(work, 'out.mp3')
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))

      const info = probeJson(out)
      assert.deepEqual(
        {
          title: info.format.tags.title,
          artist: info.format.tags.artist,
          album: info.format.tags.album,
        },
        { title: 'Sommer Mix', artist: 'Kodini', album: 'Mixe' },
      )
      assert.equal(info.format.tags.genre, undefined)
      const video = info.streams.find((s) => s.codec_type === 'video')
      assert.ok(video, 'Cover fehlt')
      assert.equal(video.disposition.attached_pic, 1)
      assert.ok(Math.abs(duration(out) - 2 * SECONDS) < 0.5)
    },
  )
}

test('N6: Cover nur als JPEG/PNG', { skip: !HAS_FFMPEG && 'ffmpeg fehlt' }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-cv-'))
  const srv = await startServer(path.join(work, 'temp'))
  t.after(() => {
    srv.stop()
    fs.rmSync(work, { recursive: true, force: true })
  })
  const track = makeTrack(work, 'a.mp3', { ext: 'mp3', freq: 500 })
  const form = new FormData()
  form.append('files[]', new Blob([fs.readFileSync(track)]), 'a.mp3')
  const { session_id: sessionId } = await (
    await fetch(`${srv.base}/api/upload`, { method: 'POST', body: form })
  ).json()
  const bad = new FormData()
  bad.append('cover', new Blob(['GIF89a']), 'bild.gif')
  const res = await fetch(`${srv.base}/api/cover/${sessionId}`, { method: 'POST', body: bad })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'INVALID_COVER')
  const leftovers = fs.readdirSync(path.join(work, 'temp')).filter((f) => f.startsWith('cv_'))
  assert.deepEqual(leftovers, [])
})

test('WebM (Opus) aus gemischten Eingaben', { skip: !HAS_FFMPEG && 'ffmpeg fehlt' }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-webm-'))
  const srv = await startServer(path.join(work, 'temp'))
  t.after(() => {
    srv.stop()
    fs.rmSync(work, { recursive: true, force: true })
  })

  const files = [
    makeTrack(work, 'a.wav', { ext: 'wav', freq: 500 }),
    makeTrack(work, 'b.mp3', { ext: 'mp3', freq: 700, rate: 48000 }),
  ]
  const { sessionId, status } = await convertViaServer(srv.base, files, 'webm', 128)
  assert.equal(status.status, 'done', JSON.stringify(status))
  const out = await download(srv.base, sessionId, path.join(work, 'out.webm'))
  assert.ok(Math.abs(duration(out) - 2 * SECONDS) < 0.5)
})

test(
  'kaputte Datei: Fehler mit Dateiname statt stiller kürzerer Playlist',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-bad-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const good = makeTrack(work, 'gut.mp3', { ext: 'mp3', freq: 440 })
    const bad = path.join(work, 'kaputt.wav')
    fs.writeFileSync(bad, Buffer.alloc(4096, 7))
    const { status } = await convertViaServer(srv.base, [good, bad])
    assert.equal(status.status, 'error')
    assert.match(status.error, /kaputt\.wav/)
    assert.equal(status.error_code, 'FILE_UNREADABLE')
    assert.equal(status.error_file, 'kaputt.wav')
  },
)

/** Mittlere Lautstärke (dB) eines Ausschnitts. */
function meanVolume(file, start, length) {
  const r = spawnSync('ffmpeg', [
    '-v',
    'info',
    '-ss',
    String(start),
    '-t',
    String(length),
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ])
  const m = r.stderr.toString().match(/mean_volume: (-?[\d.]+|-inf) dB/)
  return m && m[1] !== '-inf' ? parseFloat(m[1]) : -Infinity
}

test(
  'N4: Pause und Crossfade zwischen Tracks (auch bei identischen MP3s)',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-trans-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })
    const files = [0, 1].map((i) =>
      makeTrack(work, `t${i}.mp3`, { ext: 'mp3', freq: 500 + i * 300 }),
    )

    const gap = await convertViaServer(srv.base, files, 'mp3', 128, {
      transition: 'gap',
      transition_seconds: 1,
    })
    assert.equal(gap.status.status, 'done', JSON.stringify(gap.status))
    const gapOut = await download(srv.base, gap.sessionId, path.join(work, 'gap.mp3'))
    assert.ok(Math.abs(duration(gapOut) - 5) < 0.15, `Dauer ${duration(gapOut)}`)
    assert.ok(meanVolume(gapOut, 2.2, 0.6) < -60, 'Pause ist still')
    assert.ok(meanVolume(gapOut, 3.3, 1) > -30, 'zweiter Track nach der Pause')

    const fade = await convertViaServer(srv.base, files, 'mp3', 128, {
      transition: 'crossfade',
      transition_seconds: 1,
    })
    const fadeOut = await download(srv.base, fade.sessionId, path.join(work, 'fade.mp3'))
    assert.ok(Math.abs(duration(fadeOut) - 3) < 0.15, `Dauer ${duration(fadeOut)}`)
    // In der Überblendung ist durchgehend Signal, kein Loch
    for (const start of [1.1, 1.4, 1.7]) assert.ok(meanVolume(fadeOut, start, 0.2) > -30)
  },
)

test(
  'N5: Lautheitsangleichung gleicht leise und laute Tracks an',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-loud-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })
    const files = [
      makeTrack(work, 'quiet.wav', { ext: 'wav', freq: 500, args: ['-af', 'volume=-30dB'] }),
      makeTrack(work, 'loud.wav', { ext: 'wav', freq: 800, args: ['-af', 'volume=-3dB'] }),
    ]
    const levels = async (loudnorm) => {
      const res = await convertViaServer(srv.base, files, 'mp3', 192, { loudnorm })
      assert.equal(res.status.status, 'done', JSON.stringify(res.status))
      const out = await download(srv.base, res.sessionId, path.join(work, `l${loudnorm}.mp3`))
      return [meanVolume(out, 0.5, 1), meanVolume(out, SECONDS + 0.5, 1)]
    }

    const [quietRaw, loudRaw] = await levels(false)
    assert.ok(loudRaw - quietRaw > 20, `ohne Angleichung ${quietRaw} / ${loudRaw}`)
    const [quiet, loud] = await levels(true)
    assert.ok(Math.abs(loud - quiet) < 3, `mit Angleichung ${quiet} / ${loud}`)
  },
)

test(
  'N9: Trimmen pro Track und Stille am Rand entfernen',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-trim-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })
    const plain = [0, 1].map((i) =>
      makeTrack(work, `p${i}.mp3`, { ext: 'mp3', freq: 500 + i * 300 }),
    )

    // Track 1: 0,5–1,5 s, Track 2 unverändert → 1 + 2 s (identische MP3s: trotzdem kein Copy)
    const trimmed = await convertViaServer(srv.base, plain, 'mp3', 128, {
      tracks: [{ start: 0.5, end: 1.5 }, null],
    })
    assert.equal(trimmed.status.status, 'done', JSON.stringify(trimmed.status))
    const trimmedOut = await download(srv.base, trimmed.sessionId, path.join(work, 'trim.mp3'))
    assert.ok(Math.abs(duration(trimmedOut) - 3) < 0.15, `Dauer ${duration(trimmedOut)}`)

    // je 1 s Stille vor und nach dem Ton
    const padded = [0, 1].map((i) =>
      makeTrack(work, `s${i}.wav`, {
        ext: 'wav',
        freq: 500 + i * 300,
        args: ['-af', 'adelay=1000|1000,apad=pad_dur=1'],
      }),
    )
    const silence = await convertViaServer(srv.base, padded, 'mp3', 128, { trim_silence: true })
    assert.equal(silence.status.status, 'done', JSON.stringify(silence.status))
    const silenceOut = await download(srv.base, silence.sessionId, path.join(work, 'sil.mp3'))
    assert.ok(Math.abs(duration(silenceOut) - 4) < 0.2, `Dauer ${duration(silenceOut)}`)
    assert.deepEqual(
      segmentFrequencies(silenceOut, 2).map((f) => Math.round(f / 100) * 100),
      [500, 800],
    )

    const untouched = await convertViaServer(srv.base, padded, 'mp3', 128)
    const untouchedOut = await download(srv.base, untouched.sessionId, path.join(work, 'raw.mp3'))
    assert.ok(Math.abs(duration(untouchedOut) - 8) < 0.2, `Dauer ${duration(untouchedOut)}`)
  },
)

function probeChapters(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_chapters', '-of', 'json', file])
  return JSON.parse(r.stdout.toString()).chapters.map((c) => ({
    title: c.tags?.title,
    start: Math.round(parseFloat(c.start_time) * 10) / 10,
  }))
}

test(
  'N2: Kapitel je Track in MP3, OGG und WebM, Kapitel im Status',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-chap-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })
    const files = ['Intro', 'Song; Teil 2'].map((name, i) =>
      makeTrack(work, `${name}.mp3`, { ext: 'mp3', freq: 500 + i * 300 }),
    )
    const expected = [
      { title: 'Intro', start: 0 },
      { title: 'Song; Teil 2', start: 2 },
    ]

    // Der Upload speichert bereinigte Namen; die Titel kommen wie aus der App
    const titles = ['Intro.mp3', 'Song; Teil 2.mp3']
    // identische MP3s → Stream-Copy-Pfad
    const copy = await convertViaServer(srv.base, files, 'mp3', 192, { titles })
    assert.equal(copy.status.status, 'done', JSON.stringify(copy.status))
    assert.deepEqual(
      copy.status.chapters.map((c) => c.title),
      ['Intro', 'Song; Teil 2'],
    )
    const copyOut = await download(srv.base, copy.sessionId, path.join(work, 'copy.mp3'))
    assert.deepEqual(probeChapters(copyOut), expected)

    for (const format of ['mp3', 'ogg', 'webm']) {
      const res = await convertViaServer(srv.base, files, format, 128, {
        transition: 'gap',
        transition_seconds: 1,
        titles,
      })
      assert.equal(res.status.status, 'done', JSON.stringify(res.status))
      const out = await download(srv.base, res.sessionId, path.join(work, `c.${format}`))
      assert.deepEqual(probeChapters(out), [expected[0], { ...expected[1], start: 3 }], format)
    }
  },
)
