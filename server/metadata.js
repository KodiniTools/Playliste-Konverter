'use strict'

/**
 * Dateiname, Tags und Cover der Ausgabe (N6). Reine Funktionen; alle Werte
 * kommen vom Client und werden hier begrenzt und bereinigt. ffmpeg wird ohne
 * Shell gestartet, die Werte landen jeweils als ein einzelnes Argument.
 */

const TAG_FIELDS = ['title', 'artist', 'album']
const MAX_TAG_LENGTH = 200
const MAX_NAME_LENGTH = 100
const DEFAULT_NAME = 'playlist'
// Cover: nur JPEG/PNG, wie es ID3 (APIC) zuverlässig trägt
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png']
const MAX_COVER_SIZE = 5 * 1024 ** 2

// Steuerzeichen (inkl. Zeilenumbrüche) und in Dateinamen verbotene Zeichen
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const FORBIDDEN_IN_NAME = /[/\\:*?"<>|]/g

/** Tags aus dem Request: nur bekannte Felder, Strings, gekürzt, ohne Steuerzeichen. */
function sanitizeTags(input) {
  const tags = {}
  if (typeof input !== 'object' || input === null) return tags
  for (const field of TAG_FIELDS) {
    const value = input[field]
    if (typeof value !== 'string') continue
    const clean = value.replace(CONTROL_CHARS, ' ').trim().slice(0, MAX_TAG_LENGTH)
    if (clean) tags[field] = clean
  }
  return tags
}

/** Dateiname ohne Endung: keine Pfad-/Sonderzeichen, nicht leer, höchstens 100 Zeichen. */
function sanitizeOutputName(input) {
  if (typeof input !== 'string') return DEFAULT_NAME
  const clean = input
    .replace(CONTROL_CHARS, '')
    .replace(FORBIDDEN_IN_NAME, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim()
  return clean || DEFAULT_NAME
}

/**
 * Content-Disposition mit ASCII-Fallback und UTF-8-Namen (RFC 6266/5987),
 * damit „Mein Mix – Teil 2.mp3“ korrekt ankommt.
 */
function contentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** ffmpeg-Argumente für die Tags (leer, wenn keine gesetzt sind). */
function buildMetadataArgs(tags = {}) {
  return TAG_FIELDS.filter((field) => tags[field]).flatMap((field) => [
    '-metadata',
    `${field}=${tags[field]}`,
  ])
}

/**
 * Cover als zweite Eingabe (Index 1) einbetten: nur für MP3 (ID3 APIC).
 * Liefert Eingabe- und Ausgabe-Argumente getrennt, weil -i vor -map stehen muss.
 */
function buildCoverArgs(coverPath) {
  if (!coverPath) return { input: [], output: [] }
  return {
    input: ['-i', coverPath],
    output: [
      '-map',
      '1:v',
      '-c:v',
      'copy',
      '-disposition:v',
      'attached_pic',
      '-id3v2_version',
      '3',
      '-metadata:s:v',
      'title=Album cover',
      '-metadata:s:v',
      'comment=Cover (front)',
    ],
  }
}

/** Endung einer hochgeladenen Cover-Datei, wenn erlaubt, sonst null. */
function coverExtension(originalName) {
  const ext = String(originalName).toLowerCase().split('.').pop()
  if (!COVER_EXTENSIONS.includes(ext)) return null
  return ext === 'jpeg' ? 'jpg' : ext
}

module.exports = {
  TAG_FIELDS,
  MAX_COVER_SIZE,
  sanitizeTags,
  sanitizeOutputName,
  contentDisposition,
  buildMetadataArgs,
  buildCoverArgs,
  coverExtension,
}
