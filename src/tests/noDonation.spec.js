/**
 * Der Spenden-Button (PayPal) ist entfernt. Verhindert, dass Markup, Styles
 * oder Übersetzungen dafür zurückkehren.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SELF = fileURLToPath(import.meta.url)

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (/\.(vue|js|css)$/.test(entry) && full !== SELF) out.push(full)
  }
  return out
}

const FILES = [
  ...collect(join(ROOT_DIR, 'src')),
  ...['app.html', 'index.html', 'faq.html', 'funktion.html'].map((f) => join(ROOT_DIR, f)),
]

describe('Kein Spenden-Button', () => {
  it('enthält weder PayPal noch Spenden-Markup, -Klassen oder -Texte', () => {
    const hits = FILES.filter((file) =>
      /paypal|donate|donation|spenden|hosted_button_id/i.test(readFileSync(file, 'utf8')),
    ).map((file) => relative(ROOT_DIR, file))
    expect(hits).toEqual([])
  })
})
