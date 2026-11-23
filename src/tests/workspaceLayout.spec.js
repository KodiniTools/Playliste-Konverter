/**
 * Arbeitsbereich aus Etappe 4 (src/styles/kodini-workspace.css).
 *
 * Sobald Dateien geladen sind, stehen Upload/Titelliste und Einstellungen auf
 * breiten Bildschirmen nebeneinander, sonst untereinander. Die Tests sichern
 * die Struktur in App.vue und dass Stylesheet und Komponenten zusammenpassen.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { readRelative, resolveFrom } from '../design-system/__tests__/tokenTestUtils'

const css = readRelative(import.meta.url, '../styles/kodini-workspace.css')
const appVue = readRelative(import.meta.url, '../App.vue')
const componentDir = resolveFrom(import.meta.url, '../components')
const vueSources = [
  appVue,
  ...readdirSync(componentDir)
    .filter((name) => name.endsWith('.vue'))
    .map((name) => readRelative(import.meta.url, `../components/${name}`)),
].join('\n')

const usedInVue = (name) => new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(vueSources)

describe('Arbeitsbereich (Etappe 4)', () => {
  it('wird von der App vor den Tailwind-Utilities geladen', () => {
    const styleCss = readRelative(import.meta.url, '../style.css')
    const workspace = styleCss.indexOf("@import './styles/kodini-workspace.css';")
    const utilities = styleCss.indexOf("@import 'tailwindcss/utilities.css'")
    expect(workspace).toBeGreaterThanOrEqual(0)
    expect(workspace).toBeLessThan(utilities)
  })

  it('jede converter- und sticky-player-Klasse des Stylesheets kommt in einer Komponente vor', () => {
    const classes = [
      ...new Set([...css.matchAll(/\.((?:converter|sticky)-[\w-]+)/g)].map((m) => m[1])),
    ]
    expect(classes.length).toBeGreaterThan(0)
    expect(classes.filter((name) => !usedInVue(name))).toEqual([])
  })

  it('App.vue: Titel, Einstellungen und Auftrag liegen in dieser Reihenfolge im Arbeitsbereich', () => {
    const order = [
      'class="converter-workspace"',
      'class="converter-tracks"',
      '<FileUploader />',
      '<FileList v-if="store.files.length > 0" />',
      '<div v-if="store.files.length > 0" class="converter-options">',
      '<FormatSelector />',
      '<MixOptions />',
      '<OutputDetails />',
      'class="converter-job"',
      '<SizeWarning />',
      'converter-submit',
    ].map((needle) => appVue.indexOf(needle))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('zwei Spalten nur auf breiten Bildschirmen und nur mit geladenen Dateien', () => {
    const wide = css.match(/@media \(min-width: 960px\) \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(wide).toMatch(
      /#app \.converter-workspace:has\(\.converter-options\) \{\s*grid-template-columns: minmax\(0, 1\.12fr\) minmax\(0, 1fr\);/,
    )
    expect(wide).toMatch(/#app \.converter-job \{\s*grid-column: 1 \/ -1;/)
    // Außerhalb der Media Query gibt es keine Spaltenvorgabe für den Arbeitsbereich.
    expect(css.replace(wide, '')).not.toMatch(
      /\.converter-workspace[^{]*\{[^}]*grid-template-columns/,
    )
  })

  it('aktive Titelzeile ist über data-active markiert', () => {
    expect(vueSources).toContain(':data-active="isActive(item)"')
    expect(css).toContain("#app .converter-track-row[data-active='true']")
  })
})
