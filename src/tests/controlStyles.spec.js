/**
 * Bedienelemente aus Etappe 3 (src/styles/kodini-controls.css).
 *
 * Die Gestaltung hängt an zusätzlichen converter-*-Klassen in den Komponenten.
 * Die Tests stellen sicher, dass Stylesheet und Komponenten zusammenpassen:
 * keine Regel ohne Element, das Stylesheet wird von der App geladen, und die
 * zugesagten Eigenschaften (Mindesthöhe, Fokus, schmale Bildschirme) bleiben.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { readRelative, resolveFrom } from '../design-system/__tests__/tokenTestUtils'

const css = readRelative(import.meta.url, '../styles/kodini-controls.css')
const componentDir = resolveFrom(import.meta.url, '../components')
const vueSources = [
  readRelative(import.meta.url, '../App.vue'),
  ...readdirSync(componentDir)
    .filter((name) => name.endsWith('.vue'))
    .map((name) => readRelative(import.meta.url, `../components/${name}`)),
].join('\n')

const cssClasses = [...new Set([...css.matchAll(/\.(converter-[\w-]+)/g)].map((m) => m[1]))]

describe('Bedienelemente (Etappe 3)', () => {
  it('wird von der App vor den Tailwind-Utilities geladen', () => {
    const styleCss = readRelative(import.meta.url, '../style.css')
    const controls = styleCss.indexOf("@import './styles/kodini-controls.css';")
    const utilities = styleCss.indexOf("@import 'tailwindcss/utilities.css'")
    expect(controls).toBeGreaterThanOrEqual(0)
    expect(controls).toBeLessThan(utilities)
  })

  it('jede converter-Klasse des Stylesheets kommt in einer Komponente vor', () => {
    expect(cssClasses.length).toBeGreaterThan(0)
    const unused = cssClasses.filter(
      (name) => !new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(vueSources),
    )
    expect(unused).toEqual([])
  })

  it('Upload-Zone meldet den Drag-Zustand über data-dragging', () => {
    expect(vueSources).toContain(':data-dragging="isDragging"')
    expect(css).toContain("#app .converter-upload[data-dragging='true']")
  })

  it('Bedienflächen sind mindestens 44px hoch und zeigen den Tastaturfokus', () => {
    expect(css).toMatch(/#app \.converter-option,[^{]*\{[^}]*min-height: 44px;/)
    expect(css).toMatch(/#app \.converter-upload-actions label,[^{]*\{[^}]*min-height: 44px;/)
    expect(css).toMatch(
      /#app \.converter-option:has\(:focus-visible\),[^{]*\{[^}]*outline: 2px solid/,
    )
  })

  it('schmale Bildschirme: Upload-Aktionen und Übergänge stehen untereinander', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 420px)'))
    expect(narrow).toMatch(/\.converter-upload-actions \{\s*flex-direction: column;/)
    expect(narrow).toMatch(/\.converter-transitions \{\s*grid-template-columns: minmax\(0, 1fr\);/)
  })
})
