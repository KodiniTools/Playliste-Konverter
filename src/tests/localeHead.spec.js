import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import { PAGES, SITE_URL, applyPageHead, initLocaleHead, pageFromPath } from '../landing/localeHead'
import { resolveInitialLocale } from '../utils/localeSeo'

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
const alternates = () =>
  [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
    l.getAttribute('hreflang'),
    l.getAttribute('href'),
  ])

describe('Sprach-URLs (?lang=en)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    localStorage.clear()
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('ordnet Pfade den Seiten zu', () => {
    expect(pageFromPath('/playlistkonverter/')).toBe('index')
    expect(pageFromPath('/playlistkonverter/app.html')).toBe('app')
    expect(pageFromPath('/playlistkonverter/faq.html')).toBe('faq')
    expect(pageFromPath('/playlistkonverter/funktion.html')).toBe('funktion')
  })

  it('setzt Titel, Canonical und hreflang je Sprache', () => {
    applyPageHead('faq', 'en')
    expect(document.title).toBe(PAGES.faq.en.title)
    expect(document.documentElement.lang).toBe('en')
    expect(canonical()).toBe(`${SITE_URL}faq.html?lang=en`)
    expect(alternates()).toEqual([
      ['de', `${SITE_URL}faq.html`],
      ['en', `${SITE_URL}faq.html?lang=en`],
      ['x-default', `${SITE_URL}faq.html`],
    ])
    applyPageHead('faq', 'de')
    expect(canonical()).toBe(`${SITE_URL}faq.html`)
    expect(alternates()).toHaveLength(3)
  })

  it('folgt der gespeicherten Sprache und dem Event locale-changed', () => {
    localStorage.setItem('locale', 'en')
    window.history.replaceState(null, '', '/playlistkonverter/funktion.html')
    initLocaleHead()
    expect(document.title).toBe(PAGES.funktion.en.title)
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: 'de' } }))
    expect(document.title).toBe(PAGES.funktion.de.title)
    expect(canonical()).toBe(`${SITE_URL}funktion.html`)
  })

  it('resolveInitialLocale: ?lang vor Speicher, sonst Deutsch', () => {
    expect(resolveInitialLocale('?lang=en', 'de')).toBe('en')
    expect(resolveInitialLocale('?lang=fr', 'en')).toBe('en')
    expect(resolveInitialLocale('', null)).toBe('de')
  })

  it('jede Seite speichert ?lang im <head> vor allen Seitenskripten und nennt hreflang', () => {
    for (const [page, file] of [
      ['index', 'index.html'],
      ['app', 'app.html'],
      ['faq', 'faq.html'],
      ['funktion', 'funktion.html'],
    ]) {
      const html = readFileSync(resolve(cwd(), file), 'utf-8')
      const head = html.slice(0, html.indexOf('</head>'))
      expect(head).toContain("localStorage.setItem('locale', urlLang)")
      expect(head).toContain('src="/src/landing/localeHeadEntry.ts"')
      expect(head).toContain(`hreflang="en" href="${PAGES[page].url}?lang=en"`)
    }
  })
})
