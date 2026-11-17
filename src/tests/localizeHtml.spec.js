// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { escapeHtml, localizeHtml } from '../utils/localizeHtml'
import { PAGES } from '../landing/pages'

// Prüft die englischen Sprachfassungen, die der Build als *.en.html schreibt
// (nginx liefert sie für ?lang=en aus), gegen die echten HTML-Dateien.
const unescape = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const pick = (source, pattern) => unescape(source.match(pattern)?.[1] ?? '')
const headOf = (source) => source.slice(0, source.search(/<\/head>/i))
const title = (source) => pick(headOf(source), /<title[^>]*>([\s\S]*?)<\/title>/i)
const lang = (source) => pick(source, /<html\b[^>]*\slang="([^"]*)"/i)
const description = (source) =>
  pick(
    headOf(source).match(/<meta\b[^>]*\sname="description"[^>]*>/i)?.[0] ?? '',
    /\scontent="([^"]*)"/i,
  )
const canonical = (source) =>
  pick(headOf(source).match(/<link\b[^>]*\srel="canonical"[^>]*>/i)?.[0] ?? '', /\shref="([^"]*)"/i)
const hreflangs = (source) => headOf(source).match(/<link\b[^>]*\shreflang="[^"]*"[^>]*>/gi) ?? []
const includes = (source) => source.match(/<!--\s*#include [^>]*-->/g) ?? []

describe.each(Object.entries(PAGES))('englische Fassung von %s.html', (key, page) => {
  const html = readFileSync(new URL(`../../${key}.html`, import.meta.url), 'utf8')
  const en = localizeHtml(html, { lang: 'en', ...page.en, canonical: `${page.url}?lang=en` })

  it('setzt lang, Titel, Description und Canonical auf Englisch', () => {
    expect(lang(en)).toBe('en')
    expect(title(en)).toBe(page.en.title)
    expect(description(en)).toBe(page.en.description)
    expect(canonical(en)).toBe(`${page.url}?lang=en`)
  })

  it('lässt hreflang, Body und SSI-Includes unverändert', () => {
    expect(hreflangs(html)).toHaveLength(3)
    expect(hreflangs(en)).toEqual(hreflangs(html))
    expect(en.slice(en.search(/<\/head>/i))).toBe(html.slice(html.search(/<\/head>/i)))
    expect(includes(en)).toEqual(includes(html))
  })

  it('der deutsche Head der Quelldatei stimmt mit PAGES überein', () => {
    expect(lang(html)).toBe('de')
    expect(title(html)).toBe(page.de.title)
    expect(description(html)).toBe(page.de.description)
    expect(canonical(html)).toBe(page.url)
  })
})

describe('localizeHtml Randfälle', () => {
  const url = PAGES.index.url
  const minimal = (extra = '') =>
    `<!doctype html><html lang="de"><head><title>T</title>` +
    `<meta name="description" content="D"><link rel="canonical" href="${url}">${extra}` +
    `</head><body><svg><title>Icon</title></svg></body></html>`
  const head = { lang: 'en', title: 'A & "B" <C>', description: 'x > y & z', canonical: url }

  it('maskiert Sonderzeichen, <title> im Body bleibt unberührt', () => {
    const out = localizeHtml(minimal(), head)
    expect(out).toContain('<title>A &amp; &quot;B&quot; &lt;C&gt;</title>')
    expect(out).toContain('content="x &gt; y &amp; z"')
    expect(out).toContain('<svg><title>Icon</title></svg>')
    expect(escapeHtml('$&')).toBe('$&amp;')
  })

  it('bricht bei fehlendem oder doppeltem Pflicht-Tag ab', () => {
    expect(() => localizeHtml(minimal().replace(/<link[^>]*>/, ''), head)).toThrow(/canonical/)
    expect(() => localizeHtml(minimal('<meta name="description" content="E">'), head)).toThrow(
      /description/,
    )
    expect(() => localizeHtml('<html lang="de"><title>x</title>', head)).toThrow(/head/)
  })
})
