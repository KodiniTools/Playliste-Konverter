import { themeColorsV2, type ThemeName } from '../design-system/tokens-v2'

/**
 * Die fertige Playlist als Bild (1:1 bzw. 2:3), gezeichnet auf ein Canvas,
 * komplett lokal. Übernommen aus dem Playlist Generator (shareImage.ts),
 * dazu Textgröße und Textdeckkraft. Layout und Text sind von der Zeichnung
 * getrennt, damit sie ohne echtes Canvas testbar bleiben.
 */

export type PlaylistImageFormat = 'square' | 'portrait'
export type PlaylistImageType = 'image/png' | 'image/jpeg'

export const PLAYLIST_IMAGE_SIZES: Record<PlaylistImageFormat, { width: number; height: number }> =
  {
    square: { width: 1080, height: 1080 },
    portrait: { width: 1080, height: 1620 },
  }

/** Textgröße in Prozent der Grundgröße. */
export const TEXT_SCALE_MIN = 70
export const TEXT_SCALE_MAX = 140
/** Textdeckkraft in Prozent; darunter ist der Text nicht mehr lesbar. */
export const TEXT_OPACITY_MIN = 20

export interface ImageTrack {
  title: string
  /** Dauer in Sekunden; null = unbekannt, wird nicht angezeigt. */
  seconds: number | null
}

export interface PlaylistImageData {
  name: string
  tracks: ImageTrack[]
  /** Fertig übersetzte Kopfzeile, z. B. „12 Titel · 48 min“. */
  meta: string
  /** Übersetztes Label über dem Namen, z. B. „PLAYLIST“. */
  kicker: string
  /** Übersetzt, mit `{count}`, z. B. „+ {count} weitere Titel“. */
  moreLabel: string
  footer: string
}

export interface ImageRows {
  tracks: ImageTrack[]
  /** Anzahl nicht gezeigter Titel; 0 = alle passen. */
  more: number
}

/** Welche Titel aufs Bild passen; reicht der Platz nicht, wird die letzte Zeile zu „+ N weitere“. */
export function imageRows(tracks: ImageTrack[], maxRows: number): ImageRows {
  const max = Math.max(1, Math.floor(maxRows))
  if (tracks.length <= max) return { tracks, more: 0 }
  return { tracks: tracks.slice(0, max - 1), more: tracks.length - (max - 1) }
}

/** 3:04, 1:02:09 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Gesamtdauer kompakt: „48 min“, „1 h 05 min“; mindestens 1 min. */
export function formatTotal(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** Kürzt Text mit „…“, bis `measure(text)` höchstens `maxWidth` ist. */
export function fitText(text: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidth) return text
  const chars = Array.from(text)
  let low = 0
  let high = chars.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`) <= maxWidth) low = mid
    else high = mid - 1
  }
  return `${chars.slice(0, low).join('').trimEnd()}…`
}

/** Bricht in höchstens `maxLines` Zeilen um; die letzte wird bei Bedarf gekürzt. */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (text: string) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i]!
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate
      continue
    }
    if (lines.length === maxLines - 1) {
      lines.push(fitText(`${current} ${words.slice(i).join(' ')}`, maxWidth, measure))
      return lines
    }
    lines.push(current)
    current = words[i]!
  }
  if (current) lines.push(fitText(current, maxWidth, measure))
  return lines
}

/** Dateiname, z. B. „sommer_mix-1x1.png“. */
export function playlistImageFileName(
  name: string,
  format: PlaylistImageFormat,
  type: PlaylistImageType,
): string {
  const base =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .slice(0, 80) || 'playlist'
  const ratio = format === 'square' ? '1x1' : '2x3'
  return `${base}-${ratio}.${type === 'image/png' ? 'png' : 'jpg'}`
}

const FONT = "'Supreme', sans-serif"

interface Geometry {
  pad: number
  kicker: number
  title: number
  titleLines: number
  meta: number
  row: number
  track: number
  footer: number
}

const GEOMETRY: Record<PlaylistImageFormat, Geometry> = {
  square: {
    pad: 80,
    kicker: 26,
    title: 68,
    titleLines: 1,
    meta: 30,
    row: 80,
    track: 36,
    footer: 24,
  },
  portrait: {
    pad: 96,
    kicker: 30,
    title: 84,
    titleLines: 2,
    meta: 34,
    row: 92,
    track: 38,
    footer: 26,
  },
}

/** Geometrie mit Textgröße `scale` (1 = Grundgröße); Ränder bleiben gleich. */
export function scaledGeometry(format: PlaylistImageFormat, scale: number): Geometry {
  const g = GEOMETRY[format]
  const s = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, scale * 100)) / 100
  return {
    pad: g.pad,
    kicker: g.kicker * s,
    title: g.title * s,
    titleLines: g.titleLines,
    meta: g.meta * s,
    row: g.row * s,
    track: g.track * s,
    footer: g.footer * s,
  }
}

/** Vom Nutzer gewählte Farben (#rrggbb); fehlende Werte kommen aus dem Theme. */
export interface ImageColors {
  text: string
  background: string
}

export interface ImagePalette {
  bg: string
  /** Ende des Hintergrund-Verlaufs. */
  bgEnd: string
  text: string
  muted: string
  accent: string
  border: string
}

/** #rgb oder #rrggbb → [r, g, b]; null bei ungültigem Wert. */
export function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const hex = match[1]!.length === 3 ? match[1]!.replace(/./g, '$&$&') : match[1]!
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Mischt `a` mit `amount` (0–1) Anteil von `b`. */
export function mixColors(a: string, b: string, amount: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return a
  return toHex(x.map((v, i) => v + (y[i]! - v) * amount))
}

/** Kontrastverhältnis nach WCAG 2.1 (1–21); 1 bei ungültigen Farben. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) => {
    const rgb = parseHex(color)
    if (!rgb) return null
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return 1
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Text- und Hintergrundfarbe des Themes, Startwerte für die Farbwähler. */
export function defaultImageColors(theme: ThemeName): ImageColors {
  const c = themeColorsV2(theme)
  return { text: c.text, background: c.surface0 }
}

/**
 * Farben fürs Bild. Ohne eigene Farben exakt die Theme-Farben; mit eigenen
 * Farben werden Nebentöne aus Text und Hintergrund gemischt. Der Akzent des
 * Themes bleibt, solange er sich vom Hintergrund abhebt (≥ 3:1), sonst wird
 * die Textfarbe genommen.
 */
export function imagePalette(theme: ThemeName, colors?: Partial<ImageColors>): ImagePalette {
  const c = themeColorsV2(theme)
  const text = colors?.text && parseHex(colors.text) ? colors.text : c.text
  const bg = colors?.background && parseHex(colors.background) ? colors.background : c.surface0
  if (
    text.toLowerCase() === c.text.toLowerCase() &&
    bg.toLowerCase() === c.surface0.toLowerCase()
  ) {
    return { bg, bgEnd: c.surface1, text, muted: c.text2, accent: c.accent, border: c.border }
  }
  return {
    bg,
    bgEnd: mixColors(bg, text, 0.06),
    text,
    muted: mixColors(text, bg, 0.35),
    accent: contrastRatio(c.accent, bg) >= 3 ? c.accent : text,
    border: mixColors(text, bg, 0.75),
  }
}

/** Eigenes Hintergrundbild; liegt über der Hintergrundfarbe, unter Text und Grafik. */
export interface ImageBackground {
  image: CanvasImageSource & { width: number; height: number }
  /** Deckkraft 0–1; die Hintergrundfarbe scheint entsprechend durch. */
  opacity: number
}

/** Erlaubte Dateitypen fürs Hintergrundbild. */
export const BACKGROUND_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Höchstgröße der hochgeladenen Datei. */
export const MAX_BACKGROUND_BYTES = 20 * 1024 ** 2
/** Höchstzahl Pixel (Breite × Höhe), schützt vor riesigen Bildern im Speicher. */
export const MAX_BACKGROUND_PIXELS = 50_000_000

export type BackgroundErrorCode = 'type' | 'size' | 'decode'

export class BackgroundImageError extends Error {
  constructor(readonly code: BackgroundErrorCode) {
    super(`Hintergrundbild: ${code}`)
    this.name = 'BackgroundImageError'
  }
}

/** Prüft Typ und Größe und dekodiert das Bild. Wirft `BackgroundImageError`. */
export async function loadBackgroundImage(file: File): Promise<ImageBitmap> {
  if (!(BACKGROUND_TYPES as readonly string[]).includes(file.type)) {
    throw new BackgroundImageError('type')
  }
  if (file.size > MAX_BACKGROUND_BYTES) throw new BackgroundImageError('size')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new BackgroundImageError('decode')
  }
  if (bitmap.width * bitmap.height > MAX_BACKGROUND_PIXELS) {
    bitmap.close()
    throw new BackgroundImageError('size')
  }
  return bitmap
}

/** Ausschnitt der Quelle, der die Fläche wie `object-fit: cover` füllt (mittig zugeschnitten). */
export function coverCrop(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const target = dstWidth / dstHeight
  // Breiter als das Ziel: volle Höhe, Seiten weg; sonst volle Breite, oben/unten weg.
  const wider = srcWidth / srcHeight > target
  const sw = wider ? srcHeight * target : srcWidth
  const sh = wider ? srcHeight : srcWidth / target
  return { sx: (srcWidth - sw) / 2, sy: (srcHeight - sh) / 2, sw, sh }
}

/** Gestaltung des Bildes, wie im Dialog eingestellt. */
export interface ImageStyle {
  theme: ThemeName
  colors?: Partial<ImageColors>
  background?: ImageBackground | null
  /** Textgröße, 1 = Grundgröße (0,7–1,4). */
  textScale?: number
  /** Deckkraft aller Texte, 0–1. */
  textOpacity?: number
}

/** Zeichnet das Bild in einen 2D-Kontext der Größe `PLAYLIST_IMAGE_SIZES[format]`. */
export function drawPlaylistImage(
  ctx: CanvasRenderingContext2D,
  data: PlaylistImageData,
  format: PlaylistImageFormat,
  style: ImageStyle,
): void {
  const { width, height } = PLAYLIST_IMAGE_SIZES[format]
  const g = scaledGeometry(format, style.textScale ?? 1)
  const c = imagePalette(style.theme, style.colors)
  const textAlpha = Math.min(1, Math.max(TEXT_OPACITY_MIN / 100, style.textOpacity ?? 1))
  const measure = (text: string) => ctx.measureText(text).width
  const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`
  const backgroundImage = style.background

  // Hintergrund mit leichtem Verlauf
  const background = ctx.createLinearGradient(0, 0, 0, height)
  background.addColorStop(0, c.bg)
  background.addColorStop(1, c.bgEnd)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const hasPhoto = Boolean(backgroundImage && backgroundImage.opacity > 0)
  if (backgroundImage && hasPhoto) {
    const { image } = backgroundImage
    const { sx, sy, sw, sh } = coverCrop(image.width, image.height, width, height)
    ctx.save()
    ctx.globalAlpha = Math.min(1, backgroundImage.opacity)
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
    ctx.restore()
  }

  // Schallplatte als Akzent oben rechts, angeschnitten
  const discR = format === 'portrait' ? 270 : 220
  const discX = width - discR * 0.45
  const discY = format === 'portrait' ? 220 : 150
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = c.accent
  ctx.beginPath()
  ctx.arc(discX, discY, discR, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = c.bg
  ctx.lineWidth = 2
  for (let r = discR * 0.42; r < discR; r += discR * 0.09) {
    ctx.beginPath()
    ctx.arc(discX, discY, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = c.accent
  ctx.beginPath()
  ctx.arc(discX, discY, discR * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = c.bg
  ctx.beginPath()
  ctx.arc(discX, discY, discR * 0.05, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Auf einem Foto hebt ein weicher Schatten den Text ab: dunkel hinter hellem Text, hell hinter dunklem.
  if (hasPhoto) {
    const lightText = contrastRatio(c.text, '#000000') > contrastRatio(c.text, '#ffffff')
    ctx.shadowColor = lightText ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)'
    ctx.shadowBlur = 18
  }

  // Ab hier ist alles Text bzw. Textschmuck und folgt der Textdeckkraft.
  ctx.globalAlpha = textAlpha

  const left = g.pad
  const right = width - g.pad
  const content = right - left
  let y = g.pad + (format === 'portrait' ? 32 : 0)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Kopf: Label, Name, Meta
  ctx.fillStyle = c.accent
  ctx.font = font(g.kicker, 700)
  y += g.kicker
  ctx.fillText(data.kicker.toUpperCase(), left, y)

  ctx.fillStyle = c.text
  ctx.font = font(g.title, 700)
  // Name endet vor dem Plattenlabel, damit er nicht in die Grafik läuft.
  const titleWidth = Math.min(content, discX - discR * 0.3 - 32 - left)
  const titleLines = wrapText(data.name, titleWidth, g.titleLines, measure)
  for (const line of titleLines) {
    y += g.title * 1.15
    ctx.fillText(line, left, y)
  }

  ctx.fillStyle = c.muted
  ctx.font = font(g.meta, 500)
  y += g.meta * 1.6
  ctx.fillText(data.meta, left, y)

  y += g.meta * 1.2
  ctx.fillStyle = c.accent
  ctx.fillRect(left, y, 120, 6)
  y += 40

  // Titelzeilen: so viele, wie bis zur Fußzeile Platz haben
  const footerTop = height - g.pad - g.footer * 1.5
  const { tracks, more } = imageRows(data.tracks, (footerTop - y) / g.row)
  const numberWidth = g.track * 1.6
  const durationWidth = g.track * 3.2
  tracks.forEach((track, index) => {
    const top = y + index * g.row
    const textLeft = left + numberWidth
    const textWidth = content - numberWidth - durationWidth
    const titleY = top + g.row * 0.62

    ctx.fillStyle = c.accent
    ctx.font = font(g.track * 0.8, 700)
    ctx.fillText(String(index + 1).padStart(2, '0'), left, titleY)

    ctx.fillStyle = c.text
    ctx.font = font(g.track, 600)
    ctx.fillText(fitText(track.title, textWidth, measure), textLeft, titleY)

    if (track.seconds !== null) {
      ctx.fillStyle = c.muted
      ctx.font = font(g.track * 0.8, 500)
      ctx.textAlign = 'right'
      ctx.fillText(formatClock(track.seconds), right, titleY)
      ctx.textAlign = 'left'
    }

    if (index < tracks.length - 1 || more > 0) {
      ctx.fillStyle = c.border
      ctx.globalAlpha = textAlpha * 0.5
      ctx.fillRect(textLeft, top + g.row - 1, content - numberWidth, 2)
      ctx.globalAlpha = textAlpha
    }
  })

  if (more > 0) {
    ctx.fillStyle = c.accent
    ctx.font = font(g.track * 0.85, 600)
    ctx.fillText(
      data.moreLabel.replace('{count}', String(more)),
      left + numberWidth,
      y + tracks.length * g.row + g.row * 0.62,
    )
  }

  // Fußzeile
  ctx.fillStyle = c.muted
  ctx.font = font(g.footer, 500)
  ctx.fillText(fitText(data.footer, content, measure), left, height - g.pad + g.footer * 0.5)
  ctx.globalAlpha = 1
}

/** Rendert das Bild als PNG/JPEG. Wartet vorher auf die App-Schrift, falls der Browser sie lädt. */
export async function renderPlaylistImage(
  data: PlaylistImageData,
  format: PlaylistImageFormat,
  style: ImageStyle,
  type: PlaylistImageType = 'image/png',
): Promise<Blob> {
  const { width, height } = PLAYLIST_IMAGE_SIZES[format]
  try {
    await document.fonts?.load(`700 40px ${FONT}`)
  } catch {
    // Ohne Schrift zeichnet der Browser mit der Ersatzschrift.
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D nicht verfügbar')
  drawPlaylistImage(ctx, data, format, style)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden'))),
      type,
      0.92,
    )
  })
}

export interface ImageSummary {
  tracks: ImageTrack[]
  /** Summe der bekannten Dauern in Sekunden. */
  totalSeconds: number
  /** true, wenn mindestens eine Dauer fehlt. */
  incomplete: boolean
}

/**
 * Titel fürs Bild. Bevorzugt die Kapitel vom Server (berücksichtigen Zuschnitt,
 * Stille und Übergänge), sonst die Liste der Eingabedateien.
 */
export function imageTracks(
  chapters: readonly { title: string; start: number; end: number }[],
  files: readonly {
    name: string
    duration?: number | null
    trimStart?: number
    trimEnd?: number
  }[],
): ImageSummary {
  if (chapters.length > 0) {
    const tracks = chapters.map((c) => ({ title: c.title, seconds: Math.max(0, c.end - c.start) }))
    return {
      tracks,
      totalSeconds: tracks.reduce((sum, t) => sum + t.seconds, 0),
      incomplete: false,
    }
  }
  let totalSeconds = 0
  let incomplete = false
  const tracks = files.map((file) => {
    const duration = typeof file.duration === 'number' ? file.duration : null
    const seconds =
      duration === null ? null : Math.max(0, (file.trimEnd ?? duration) - (file.trimStart ?? 0))
    if (seconds === null) incomplete = true
    else totalSeconds += seconds
    return { title: file.name.replace(/\.[^.]+$/, ''), seconds }
  })
  return { tracks, totalSeconds, incomplete }
}
