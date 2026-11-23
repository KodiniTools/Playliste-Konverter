/**
 * Werkzeugnavigation aus Etappe 2: Übersicht, Konverter, Anleitung und FAQ
 * tragen dieselbe Navigation (Logo + drei Links) und markieren genau die
 * eigene Seite mit aria-current="page".
 */
import { describe, expect, it } from 'vitest'
import { readRelative } from '../design-system/__tests__/tokenTestUtils'

const read = (file) => readRelative(import.meta.url, `../../${file}`)

/** Liefert den Block der Werkzeugnavigation (Element mit Klasse converter-nav). */
function navBlock(source, file) {
  const start = source.indexOf('converter-nav')
  const end = source.indexOf('</nav>', start)
  if (start < 0 || end < 0) throw new Error(`Keine Werkzeugnavigation in ${file}`)
  return source.slice(start, end)
}

const PAGES = [
  { file: 'index.html', current: 'class="converter-brand"' },
  { file: 'faq.html', current: 'href="./faq.html"' },
  { file: 'funktion.html', current: 'href="./funktion.html"' },
]

describe('Werkzeugnavigation', () => {
  it.each(PAGES)('$file: Logo, drei Links und genau eine aktive Seite', ({ file, current }) => {
    const nav = navBlock(read(file), file)
    expect(nav).toContain('href="./" class="converter-brand"')
    expect(nav).toMatch(/<img src="\/src\/assets\/kodinitools-logo\.png"[^>]* alt="">/)
    for (const href of ['./app.html', './faq.html', './funktion.html']) {
      expect(nav).toContain(`href="${href}"`)
    }
    const active = nav.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? []
    expect(active).toHaveLength(1)
    expect(active[0]).toContain(current)
  })

  it.each(['index.html', 'faq.html', 'funktion.html'])(
    '%s: nav.converter ist in DE und EN übersetzt',
    (file) => {
      const source = read(file)
      expect(source).toContain("'nav.converter': 'Konverter'")
      expect(source).toContain("'nav.converter': 'Converter'")
    },
  )

  it('App.vue: Konverter ist aktive Seite, Links zu Übersicht, FAQ und Anleitung', () => {
    const nav = navBlock(read('src/App.vue'), 'src/App.vue')
    expect(nav).toContain('href="./" class="converter-brand"')
    expect(nav).toContain('href="./faq.html"')
    expect(nav).toContain('href="./funktion.html"')
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1)
    expect(nav).toMatch(/<span aria-current="page"[^>]*>\{\{ t\('nav\.converter'\) \}\}/)
  })

  it('Stylesheets: Header-Styles sind in App und Landing-Seiten eingebunden', () => {
    expect(read('src/style.css')).toContain("@import './styles/kodini-header.css';")
    expect(read('src/landing/landing.css')).toContain("@import '../styles/kodini-header.css';")
  })
})
