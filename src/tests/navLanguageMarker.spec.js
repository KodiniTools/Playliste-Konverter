/**
 * Aktive Sprache in der zentralen SSI-Navigation (.global-nav-lang-btn.active).
 *
 * Fehlerbild: Auf der Startseite war die gewählte Sprache nicht zu erkennen,
 * weil home.css jedem Element im Partial Hintergrund und Textfarbe nimmt. Auf
 * den übrigen Seiten färbte das Partial sie in der Linkfarbe statt wie im
 * Playlist Generator. Die Tests sichern die Markierung in beiden Stylesheets
 * und dass sie über den erzwingenden Regeln liegt.
 */
import { describe, expect, it } from 'vitest'
import { normalize, readRelative } from '../design-system/__tests__/tokenTestUtils'

const strip = (css) => normalize(css.replace(/\/\*[\s\S]*?\*\//g, ''))
const homeCss = strip(readRelative(import.meta.url, '../landing/home.css'))
const headerCss = strip(readRelative(import.meta.url, '../styles/kodini-header.css'))
const foundationCss = strip(readRelative(import.meta.url, '../styles/foundation.css'))

/** Spezifität [IDs, Klassen/Attribute/Pseudoklassen, Elemente]; :not() zählt sein Argument. */
function specificity(selector) {
  const flat = selector.replace(/:not\(/g, ' ').replace(/[()>*]/g, ' ')
  const ids = (flat.match(/#[\w-]+/g) ?? []).length
  const classes = (flat.match(/\.[\w-]+|\[[^\]]+\]|:(?!not)[\w-]+/g) ?? []).length
  const elements = (flat.replace(/[#.:][\w-]+|\[[^\]]+\]/g, ' ').match(/[a-z][\w-]*/g) ?? []).length
  return [ids, classes, elements]
}
const outranks = (a, b) => {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** Alle Regeln als { selectors, body }. */
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    body: match[2],
  }))
}

const FILL = /background(?:-color)?: var\(--ds-accent-fill\) !important;/
const TEXT = /color: var\(--ds-on-accent-fill\) !important;/

describe('Aktive Sprache in der zentralen Navigation', () => {
  it('Startseite: markiert die aktive Sprache gefüllt wie den Primärbutton', () => {
    const marker = rules(homeCss).filter((rule) =>
      rule.selectors.some((selector) => selector.includes('.global-nav-lang-btn.active')),
    )
    expect(marker).toHaveLength(1)
    expect(marker[0].body).toMatch(FILL)
    expect(marker[0].body).toMatch(TEXT)
  })

  it('Startseite: die Markierung liegt über jeder Regel, die Partial-Textfarben erzwingt', () => {
    const all = rules(homeCss)
    const marker = all.find((rule) => rule.selectors[0].includes('.global-nav-lang-btn.active'))
    const markerSpecificity = specificity(marker.selectors[0])
    const forcing = all.filter(
      (rule) =>
        rule !== marker &&
        rule.selectors.some((selector) => selector.startsWith('body > :not(#app)')) &&
        /(?:^|[;\s])color: [^;]+ !important/.test(rule.body),
    )
    // Text, Links und Link-Hover
    expect(forcing.length).toBeGreaterThanOrEqual(3)
    for (const rule of forcing) {
      for (const selector of rule.selectors) {
        expect(
          outranks(markerSpecificity, specificity(selector)),
          `${selector} schlägt die Markierung`,
        ).toBe(true)
      }
    }
  })

  it('App, FAQ und Anleitung: markieren die aktive Sprache gleich', () => {
    expect(headerCss).toMatch(
      /:root\[data-theme\] body > \.global-nav \.global-nav-lang-btn\.active \{ background: var\(--ds-accent-fill\) var\(--ds-accent-fill-grad\) !important; color: var\(--ds-on-accent-fill\) !important; \}/,
    )
    // foundation.css nimmt die zentrale Navigation von den erzwingenden Regeln aus
    expect(foundationCss).not.toMatch(/body > :not\(#app\):not\(script\)/)
    expect(foundationCss).toContain('body > :not(#app, .global-nav):not(script)')
  })

  it('die Spezifitätsrechnung stimmt für bekannte Selektoren', () => {
    expect(specificity('html body .global-nav .global-nav-lang-btn.active')).toEqual([0, 3, 2])
    expect(specificity("body > :not(#app):not(script) a:hover:not([class*='cookie']) *")).toEqual([
      1, 2, 3,
    ])
  })
})
