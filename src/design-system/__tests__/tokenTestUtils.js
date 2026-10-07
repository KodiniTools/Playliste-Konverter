/**
 * Hilfsfunktionen für die Token-Tests: CSS-Blöcke parsen, JSON-Tokens einsammeln,
 * WCAG-Kontrast berechnen. Keine Testdatei (kein .spec-Suffix).
 * JS-Port von KodiniTools/collage-maker (src/design-system/__tests__/tokenTestUtils.ts).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** @param {string} value */
export const normalize = (value) => value.replace(/\s+/g, ' ').trim()

/**
 * @param {string} baseUrl import.meta.url der aufrufenden Datei
 * @param {string} relative
 */
export function resolveFrom(baseUrl, relative) {
  return fileURLToPath(new URL(relative, baseUrl))
}

/**
 * @param {string} baseUrl
 * @param {string} relative
 */
export function readRelative(baseUrl, relative) {
  return readFileSync(resolveFrom(baseUrl, relative), 'utf8')
}

/**
 * Liest alle Custom Properties eines Blocks mit exakt diesem Selektor (keine verschachtelten Blöcke).
 * @param {string} css
 * @param {string} selector
 * @param {string} [fileName]
 * @returns {Record<string, string>}
 */
export function parseBlock(css, selector, fileName = 'CSS') {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = withoutComments.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`Block "${selector}" nicht in ${fileName} gefunden`)

  const declarations = {}
  for (const [, name, value] of (match[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) declarations[name] = normalize(value)
  }
  return declarations
}

/**
 * Sammelt alle Token-Blätter ($value) aus einem Token-JSON mit ihrem Pfad.
 * @param {unknown} node
 * @param {string[]} [path]
 * @returns {{ path: string, value: string, cssVar?: string }[]}
 */
export function collectTokens(node, path = []) {
  if (typeof node !== 'object' || node === null) return []

  if ('$value' in node) {
    return [{ path: path.join('.'), value: String(node.$value), cssVar: node.$extensions?.css }]
  }

  return Object.entries(node)
    .filter(([key]) => !key.startsWith('$'))
    .flatMap(([key, child]) => collectTokens(child, [...path, key]))
}

/**
 * Relative Leuchtdichte nach WCAG 2.x für #rrggbb.
 * @param {string} hex
 */
export function relativeLuminance(hex) {
  const digits = hex.trim().match(/^#([0-9a-f]{6})$/i)?.[1]
  if (digits === undefined) throw new Error(`Kein #rrggbb-Wert: ${hex}`)
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((offset) => {
    const value = parseInt(digits.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG-Kontrastverhältnis zweier #rrggbb-Farben (1 bis 21).
 * @param {string} foreground
 * @param {string} background
 */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}
