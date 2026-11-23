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
})
