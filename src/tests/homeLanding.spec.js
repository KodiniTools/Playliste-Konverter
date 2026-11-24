/**
 * Startseite (index.html) nach dem Muster des Audio Normalizers.
 *
 * Die Seite lädt ein eigenes Stylesheet (src/landing/home.css) mit den
 * Basistokens statt der Laufzeit-Palette der App. Die Tests sichern
 * - nur Supreme Regular 400 ohne künstliches Fett,
 * - die vom Normalizer übernommenen Token-Werte (Hero-Akzent, Verläufe),
 * - den Bildrahmen mit 1120 × 630 und die Navigation,
 * - das FAQ-Akkordeon mit Übersetzungen in DE und EN.
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  parseBlock,
  readRelative,
  resolveFrom,
} from '../design-system/__tests__/tokenTestUtils'

const html = readRelative(import.meta.url, '../../index.html')
const homeCss = readRelative(import.meta.url, '../landing/home.css')
const homeTokensCss = readRelative(import.meta.url, '../design-system/kodini-home-tokens.css')
const baseCss = readRelative(import.meta.url, '../design-system/tokens-v2.css')

const css = homeCss.replace(/\/\*[\s\S]*?\*\//g, '')
const LIGHT_SELECTOR = ".light-theme,\n:root[data-theme='light']"
const homeDark = parseBlock(homeTokensCss, ':root', 'kodini-home-tokens.css')
const homeLight = parseBlock(homeTokensCss, LIGHT_SELECTOR, 'kodini-home-tokens.css')
const baseDark = parseBlock(baseCss, ':root', 'tokens-v2.css')
const baseLight = parseBlock(baseCss, '.light-theme', 'tokens-v2.css')

describe('Startseite: Stylesheet', () => {
  it('lädt home.css statt landing.css', () => {
    expect(html).toContain('<link rel="stylesheet" href="/src/landing/home.css" />')
    expect(html).not.toContain('/src/landing/landing.css')
  })

  it('nutzt die Basistokens ohne Laufzeit-Palette der App', () => {
    const base = css.indexOf("@import '../design-system/tokens-v2.css';")
    const home = css.indexOf("@import '../design-system/kodini-home-tokens.css';")
    expect(base).toBeGreaterThanOrEqual(0)
    expect(home).toBeGreaterThan(base)
    expect(css).not.toMatch(/@import [^;]*(?:foundation|kodini-ui-tokens|landing\.css)/)
  })

  it('nutzt nur Variablen, die in den Tokens definiert sind', () => {
    const buttonTokensCss = readRelative(
      import.meta.url,
      '../design-system/kodini-button-tokens.css',
    )
    const defined = new Set(
      (baseCss + homeTokensCss + buttonTokensCss).match(/--ds-[a-z0-9-]+(?=\s*:)/g),
    )
    const used = new Set(css.match(/--ds-[a-z0-9-]+/g))
    expect([...used].filter((variable) => !defined.has(variable))).toEqual([])
  })
})

describe('Startseite: nur Supreme Regular 400', () => {
  it('deklariert genau eine Schrift: Supreme 400', () => {
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? []
    expect(faces).toHaveLength(1)
    expect(faces[0]).toMatch(/font-family:\s*'Supreme'/)
    expect(faces[0]).toMatch(/font-weight:\s*400;/)
    expect(faces[0]).toContain("url('../assets/fonts/Supreme-Regular.woff2')")
  })

  it('setzt alle Gewichts-Tokens auf 400', () => {
    for (const token of ['--ds-weight-medium', '--ds-weight-semibold', '--ds-weight-bold']) {
      expect(homeDark[token]).toBe('400')
    }
    expect(baseDark['--ds-weight-regular']).toBe('400')
  })

  it('verbietet künstliches Fett und nutzt keine festen Gewichte über 400', () => {
    expect(css).toMatch(/body \{[^}]*font-synthesis: none;/)
    const weights = [...css.matchAll(/font-weight:\s*([^;]+);/g)].map((match) => match[1].trim())
    const allowed = /^(?:400|normal|inherit|var\(--ds-weight-(?:regular|medium|semibold|bold)\))$/
    expect(weights.filter((weight) => !allowed.test(weight))).toEqual([])
  })

  it('lädt die Schrift vorab', () => {
    expect(html).toMatch(
      /<link rel="preload" href="\/src\/assets\/fonts\/Supreme-Regular\.woff2" as="font" type="font\/woff2" crossorigin \/>/,
    )
  })
})

describe('Startseite: Werte des Audio Normalizers', () => {
  it('Hero-Akzent und Verläufe entsprechen dem Normalizer (dunkel und hell)', () => {
    expect(homeDark['--ds-heading-accent']).toBe('#69d7e9')
    expect(homeDark['--ds-glow-blue']).toBe('rgba(55, 114, 202, 0.2)')
    expect(homeDark['--ds-glow-cyan']).toBe('rgba(38, 167, 187, 0.16)')
    expect(homeLight['--ds-heading-accent']).toBe('#086a80')
    expect(homeLight['--ds-glow-blue']).toBe('rgba(86, 147, 216, 0.15)')
    expect(homeLight['--ds-glow-cyan']).toBe('rgba(35, 162, 195, 0.16)')
  })

  it('die cyanfarbene Unterzeile erfüllt WCAG AA auf der Seitenfläche', () => {
    expect(css).toMatch(/\.hero-subtitle \{[^}]*color: var\(--ds-heading-accent\);/)
    expect(
      contrastRatio(homeDark['--ds-heading-accent'], baseDark['--ds-surface-0']),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(homeLight['--ds-heading-accent'], baseLight['--ds-surface-0']),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('Titelgröße und Hero-Raster wie im Normalizer', () => {
    expect(css).toMatch(/\.hero-title \{[^}]*font-size: clamp\(2\.25rem, 5\.25vw, 4\.5rem\);/)
    expect(css).toMatch(/grid-template-columns: minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\);/)
  })
})

describe('Startseite: Aufbau', () => {
  it('Bildrahmen mit 1120 × 630 und gebündeltem Bild', () => {
    const image = html.match(/<img[^>]*class="hero-image"[^>]*>/)?.[0] ?? ''
    expect(image).toContain('src="/src/assets/landing-hero.webp"')
    expect(image).toContain('width="1120"')
    expect(image).toContain('height="630"')
    expect(image).toMatch(/alt="[^"]+"/)
    expect(html).toMatch(/<figure class="hero-media">\s*<img/)
    expect(existsSync(resolveFrom(import.meta.url, '../assets/landing-hero.webp'))).toBe(true)
  })

  it('Navigation: Name, Links zu Konverter, Anleitung und FAQ, genau eine aktive Seite', () => {
    const start = html.indexOf('<div class="hero-nav">')
    const nav = html.slice(start, html.indexOf('</nav>', start))
    expect(nav).toContain('<a href="./" class="hero-nav-brand">')
    expect(nav).toContain(
      '<span class="hero-nav-brand-text" data-i18n="nav.logo">Wiedergabeliste Konverter</span>',
    )
    // Kein Bild-Logo: das bringt die zentrale Navigation (nav.html) schon mit.
    expect(nav).not.toContain('<img')
    for (const href of ['#features', './app.html', './funktion.html', './faq.html']) {
      expect(nav).toContain(`href="${href}" class="hero-nav-link"`)
    }
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain("'nav.logo': 'Wiedergabeliste Konverter'")
    expect(html).toContain("'nav.logo': 'Playlist Converter'")
    expect(html).toContain("'nav.converter': 'Konverter'")
    expect(html).toContain("'nav.converter': 'Converter'")
  })

  it('genau eine h1 mit dem Namen des Werkzeugs', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(
      /<h1 class="hero-title" data-i18n="hero\.title">Wiedergabeliste Konverter<\/h1>/,
    )
  })

  it('FAQ: sechs Einträge, zu Beginn geschlossen, in DE und EN übersetzt', () => {
    expect(html.match(/<div class="faq-item">/g)).toHaveLength(6)
    for (let n = 1; n <= 6; n += 1) {
      expect(html).toMatch(
        new RegExp(
          `<button[^>]*class="faq-question"[^>]*aria-expanded="false"[^>]*aria-controls="faq-answer-${n}"`,
        ),
      )
      expect(html).toMatch(new RegExp(`id="faq-answer-${n}"[^>]*hidden`))
      for (const key of [`faq.q${n}`, `faq.a${n}`]) {
        expect(html).toContain(`data-i18n="${key}"`)
        expect(html.split(`'${key}':`)).toHaveLength(3)
      }
    }
    expect(html).toContain("setAttribute('aria-expanded', String(open))")
  })

  it('jeder data-i18n-Schlüssel ist in DE und EN vorhanden', () => {
    const keys = new Set(
      [...html.matchAll(/data-i18n(?:-alt)?="([^"]+)"/g)].map((match) => match[1]),
    )
    expect(keys.size).toBeGreaterThan(20)
    const missing = [...keys].filter((key) => html.split(`'${key}':`).length !== 3)
    expect(missing).toEqual([])
  })
})
