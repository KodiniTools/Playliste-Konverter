/**
 * Laufzeit-Palette aus Etappe 1 (src/design-system/kodini-ui-tokens.css).
 *
 * Die Datei überschreibt die Basistokens (tokens-v2.css) für die Oberfläche.
 * Die Tests stellen sicher, dass
 * - die Palette nach den Basistokens geladen wird (sonst wirkt sie nicht),
 * - beim Wechsel auf Hell keine Dunkel-Farbe der neuen Palette stehen bleibt,
 * - Text, Links und Gold-Buttons in beiden Themes WCAG AA erfüllen.
 */
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseBlock, readRelative } from '../design-system/__tests__/tokenTestUtils'

const baseCss = readRelative(import.meta.url, '../design-system/tokens-v2.css')
const uiCss = readRelative(import.meta.url, '../design-system/kodini-ui-tokens.css')
const foundationCss = readRelative(import.meta.url, '../styles/foundation.css')

const LIGHT_SELECTOR = ".light-theme,\n:root[data-theme='light']"
const uiDark = parseBlock(uiCss, ':root', 'kodini-ui-tokens.css')
const uiLight = parseBlock(uiCss, LIGHT_SELECTOR, 'kodini-ui-tokens.css')
const baseDark = parseBlock(baseCss, ':root', 'tokens-v2.css')
const baseLightApp = parseBlock(baseCss, '.light-theme', 'tokens-v2.css')
const baseLightSsi = parseBlock(baseCss, ":root[data-theme='light']", 'tokens-v2.css')

/** Effektive Werte je Theme in Kaskadenreihenfolge (Basis, dann neue Palette). */
const effective = {
  dark: { ...baseDark, ...uiDark },
  light: { ...baseDark, ...uiDark, ...baseLightApp, ...uiLight },
}

const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value)

describe('Laufzeit-Palette (Etappe 1)', () => {
  it('wird nach den Basistokens eingebunden', () => {
    const baseIndex = foundationCss.indexOf("@import '../design-system/tokens-v2.css'")
    const uiIndex = foundationCss.indexOf("@import '../design-system/kodini-ui-tokens.css'")
    expect(baseIndex).toBeGreaterThanOrEqual(0)
    expect(uiIndex).toBeGreaterThan(baseIndex)
  })

  it('lässt im Hell-Theme keine Dunkel-Farbe der neuen Palette stehen', () => {
    // Jede Farbe, die die Palette für Dunkel setzt, muss für Hell entweder in der
    // Palette selbst oder in beiden Hell-Blöcken der Basistokens gesetzt sein.
    const leaking = Object.entries(uiDark)
      .filter(([, value]) => isColor(value))
      .map(([name]) => name)
      .filter((name) => !(name in uiLight) && !(name in baseLightApp && name in baseLightSsi))
    expect(leaking).toEqual([])
  })

  it.each(['dark', 'light'])('%s: Text und Links erfüllen WCAG AA auf allen Flächen', (theme) => {
    const c = effective[theme]
    const failures = []
    for (const surface of [
      '--ds-surface-0',
      '--ds-surface-1',
      '--ds-surface-2',
      '--ds-surface-3',
    ]) {
      for (const text of ['--ds-text', '--ds-text-2', '--ds-text-3', '--ds-link']) {
        const ratio = contrastRatio(c[text], c[surface])
        if (ratio < 4.5) failures.push(`${text} auf ${surface}: ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it.each(['dark', 'light'])(
    '%s: on-accent erfüllt WCAG AA auf accent und accent-hover',
    (theme) => {
      const c = effective[theme]
      expect(contrastRatio(c['--ds-on-accent'], c['--ds-accent'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(c['--ds-on-accent'], c['--ds-accent-hover'])).toBeGreaterThanOrEqual(4.5)
    },
  )

  // Abschlusskorrekturen (Etappe 5): Fokus, aktive Navigation und Zuschnitt-Hinweise
  // nutzen die Linkfarbe, weil Gold auf hellen Flächen zu wenig Kontrast hat.
  it.each(['dark', 'light'])('%s: der Fokus-Ring nutzt die Linkfarbe', (theme) => {
    const ring = (theme === 'dark' ? uiDark : uiLight)['--ds-focus-ring']
    expect(ring).toBe('0 0 0 2px var(--ds-surface-0), 0 0 0 4px var(--ds-link)')
    // Nicht-Text-Kontrast (WCAG 1.4.11) des Rings auf allen Flächen
    const c = effective[theme]
    for (const surface of ['--ds-surface-0', '--ds-surface-1', '--ds-surface-2']) {
      expect(contrastRatio(c['--ds-link'], c[surface])).toBeGreaterThanOrEqual(3)
    }
  })

  it('aktive Navigation und Zuschnitt-Hinweise nutzen die Linkfarbe statt Gold', () => {
    const headerCss = readRelative(import.meta.url, '../styles/kodini-header.css')
    expect(headerCss).toMatch(
      /\.nav-link\[aria-current='page'\] \{[^}]*box-shadow: inset 0 -2px var\(--ds-link\);/,
    )
    const fileList = readRelative(import.meta.url, '../components/FileList.vue')
    expect(fileList).toMatch(/class="ml-1 text-link" data-testid="trim-badge"/)
    expect(fileList).not.toMatch(/\btext-accent\b/)
  })

  it.each(['app.html', 'index.html', 'faq.html', 'funktion.html'])(
    '%s: theme-color entspricht der Seitenfläche der Palette',
    (file) => {
      const html = readRelative(import.meta.url, `../../${file}`)
      const metaColor = (scheme) =>
        html.match(
          new RegExp(
            `<meta name="theme-color" content="(#[0-9a-f]{6})" media="\\(prefers-color-scheme: ${scheme}\\)"`,
          ),
        )?.[1]
      expect(metaColor('dark')).toBe(uiDark['--ds-surface-0'])
      expect(metaColor('light')).toBe(uiLight['--ds-surface-0'])
    },
  )
})
