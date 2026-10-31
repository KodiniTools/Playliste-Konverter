import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'

const BASE = 'https://kodinitools.com/playlistkonverter/'
const PAGES = {
  'index.html': BASE,
  'app.html': `${BASE}app.html`,
  'faq.html': `${BASE}faq.html`,
  'funktion.html': `${BASE}funktion.html`,
}

describe('Canonical je Seite', () => {
  for (const [file, url] of Object.entries(PAGES)) {
    it(`${file} verweist auf sich selbst`, () => {
      const html = readFileSync(resolve(cwd(), file), 'utf-8')
      const head = new DOMParser().parseFromString(html, 'text/html').head
      const links = head.querySelectorAll('link[rel="canonical"]')
      expect(links).toHaveLength(1)
      expect(links[0].getAttribute('href')).toBe(url)
    })
  }
})
