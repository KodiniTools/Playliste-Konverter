/**
 * Gefüllte Buttons übernehmen Hintergrund und Schriftfarbe des Playlist
 * Generators (src/design-system/kodini-button-tokens.css).
 *
 * Die Tests sichern
 * - die übernommenen Werte in dunkel und hell samt WCAG AA,
 * - dass App, Infoseiten und Startseite die Tokens laden,
 * - dass kein Button mehr die Goldfläche bg-accent nutzt.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  parseBlock,
  readRelative,
  resolveFrom,
} from '../design-system/__tests__/tokenTestUtils'

const read = (file) => readRelative(import.meta.url, file)
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const tokensCss = read('../design-system/kodini-button-tokens.css')
const LIGHT_SELECTOR = ".light-theme,\n:root[data-theme='light']"
const tokens = {
  dark: parseBlock(tokensCss, ':root', 'kodini-button-tokens.css'),
  light: parseBlock(tokensCss, LIGHT_SELECTOR, 'kodini-button-tokens.css'),
}

const SRC_DIR = resolveFrom(import.meta.url, '..')
function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : name.endsWith('.vue') ? [path] : []
  })
}

describe('Gefüllte Buttons wie im Playlist Generator', () => {
  it('übernimmt die Werte des Generators für dunkel und hell', () => {
    expect(tokens.dark).toEqual({
      '--ds-accent-fill': '#8f6320',
      '--ds-accent-fill-hover': '#9a6b24',
      '--ds-on-accent-fill': '#ffffff',
    })
    expect(tokens.light).toEqual({
      '--ds-accent-fill': '#8f6320',
      '--ds-accent-fill-hover': '#7d561c',
      '--ds-on-accent-fill': '#ffffff',
    })
  })

  it.each(['dark', 'light'])('%s: Schrift erfüllt WCAG AA auf Fläche und Hover', (theme) => {
    const c = tokens[theme]
    expect(contrastRatio(c['--ds-on-accent-fill'], c['--ds-accent-fill'])).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      contrastRatio(c['--ds-on-accent-fill'], c['--ds-accent-fill-hover']),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('App, Infoseiten und Startseite laden die Tokens nach ihrer Palette', () => {
    const foundation = withoutComments(read('../styles/foundation.css'))
    expect(foundation.indexOf('kodini-button-tokens.css')).toBeGreaterThan(
      foundation.indexOf('kodini-ui-tokens.css'),
    )
    const home = withoutComments(read('../landing/home.css'))
    expect(home.indexOf('kodini-button-tokens.css')).toBeGreaterThan(
      home.indexOf('kodini-home-tokens.css'),
    )
  })

  it('Tailwind kennt die Klassen accent-fill, accent-fill-hover und on-accent-fill', () => {
    const style = read('../style.css')
    expect(style).toContain('--color-accent-fill: var(--ds-accent-fill);')
    expect(style).toContain('--color-accent-fill-hover: var(--ds-accent-fill-hover);')
    expect(style).toContain('--color-on-accent-fill: var(--ds-on-accent-fill);')
  })

  it('Startseite, FAQ und Anleitung: Primärbutton nutzt Fläche, Hover und Schrift der Tokens', () => {
    const home = withoutComments(read('../landing/home.css'))
    expect(home).toMatch(
      /\.btn-hero \{[^}]*background: var\(--ds-accent-fill\);\s*color: var\(--ds-on-accent-fill\);/,
    )
    expect(home).toMatch(
      /\.btn-hero:hover \{\s*background: var\(--ds-accent-fill-hover\);\s*color: var\(--ds-on-accent-fill\);/,
    )
    const landing = withoutComments(read('../landing/landing.css'))
    expect(landing).toMatch(
      /\.landing \.btn-primary \{\s*background: var\(--ds-accent-fill\);\s*color: var\(--ds-on-accent-fill\);/,
    )
    expect(landing).toMatch(
      /\.landing \.btn-primary:hover \{\s*background: var\(--ds-accent-fill-hover\);/,
    )
    expect(home + landing).not.toMatch(/var\(--ds-on-accent\)/)
  })

  it('App: kein Button nutzt mehr die Goldfläche, gefüllte Buttons sind vollständig', () => {
    const goldFill = /(?<![\w:-])(?:(?:disabled:)?hover:)?bg-accent(?:-hover)?(?![\w/-])/
    const offenders = []
    let filled = 0
    for (const file of vueFiles(SRC_DIR)) {
      const lines = readRelative(import.meta.url, file).split('\n')
      lines.forEach((line, index) => {
        const where = `${file.slice(SRC_DIR.length + 1)}:${index + 1}`
        // Fortschrittsbalken ist kein Button und bleibt Gold.
        if (goldFill.test(line) && !file.endsWith('ConversionProgress.vue')) offenders.push(where)
        if (/text-on-accent(?!-fill)/.test(line)) offenders.push(where)
        if (/(?<![\w:-])bg-accent-fill(?![\w-])/.test(line)) {
          filled += 1
          if (!line.includes('text-on-accent-fill') || !line.includes('hover:bg-accent-fill-hover'))
            offenders.push(where)
        }
      })
    }
    expect(offenders).toEqual([])
    expect(filled).toBe(7)
  })
})
