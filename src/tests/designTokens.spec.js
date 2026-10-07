/**
 * Regressionsschutz für die Design-Tokens der Oberfläche.
 *
 * Die Oberfläche läuft auf den gemeinsamen KodiniTools-Tokens (--ds-*, siehe
 * src/design-system/README.md). Tailwind kennt nur noch semantische Farbklassen
 * (surface, line, ink, accent, on-accent, link, Status); die Variablen wechseln
 * mit dem Theme. Diese Tests verhindern die Rückkehr der alten v1-Palette
 * (neutral, muted, secondary, dark, accent-dark/-light), von dark:-Varianten,
 * Blur, Karten-Schatten, Hover-Lifts und Tailwind-Standardfarben und stellen
 * sicher, dass Supreme in allen genutzten Gewichten geladen wird.
 * Port von KodiniTools/collage-maker (src/tests/designTokens.spec.ts).
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT_DIR = join(SRC_DIR, '..')
const foundationCss = readFileSync(join(SRC_DIR, 'styles', 'foundation.css'), 'utf8')
const tailwindConfig = readFileSync(join(ROOT_DIR, 'tailwind.config.js'), 'utf8')

function collectFiles(dir, extension, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, extension, out)
    } else if (entry.endsWith(extension)) {
      out.push(full)
    }
  }
  return out
}

/** Vue-Komponenten plus alle Stylesheets (App, Grundlage, Landing-Seite). */
const UI_FILES = [...collectFiles(SRC_DIR, '.vue'), ...collectFiles(SRC_DIR, '.css')].filter(
  (file) => !file.includes(join('src', 'design-system')),
)

/** Liefert alle Zeilen (Datei:Zeile), in denen das Muster vorkommt. */
function findInUiFiles(pattern) {
  const hits = []
  for (const file of UI_FILES) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        hits.push(`${relative(SRC_DIR, file)}:${index + 1}`)
      }
    })
  }
  return hits
}

describe('Design-Tokens in Vue-Komponenten und Stylesheets', () => {
  it('nutzen keine Klassen der alten v1-Palette (neutral, muted, secondary, dark, accent-dark …)', () => {
    const legacy =
      /\b(?:bg|text|border|ring|fill|stroke|divide|outline|placeholder)-(?:neutral|muted|secondary|dark)(?:-(?:dark|light|lighter|card))?(?:\b|\/)|\baccent-(?:dark|light)\b/
    expect(findInUiFiles(legacy)).toEqual([])
  })

  it('nutzen keine Tailwind-Standardfarben (red-500, green-600, white/20 …)', () => {
    const defaults =
      /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-white\b/
    expect(findInUiFiles(defaults)).toEqual([])
  })

  it('nutzen keine dark:-Varianten mehr (die Tokens wechseln mit dem Theme)', () => {
    expect(findInUiFiles(/\bdark:/)).toEqual([])
  })

  it('nutzen keine Gradients, Blur, Karten-Schatten oder Hover-Lifts', () => {
    const effects =
      /\b(?:bg-gradient-to-\w+|backdrop-blur(?:-\w+)?|(?:hover:)?shadow-(?:sm|md|lg|xl|2xl)|(?:hover:)?scale-\[?[\d.]+\]?|hover:-translate-y-[\d.]+)(?![\w-])|shadow-\[/
    expect(findInUiFiles(effects)).toEqual([])
  })

  it('nutzen nur die drei Radien und die Token-Dauern', () => {
    expect(findInUiFiles(/\brounded-(?:xl|2xl|3xl)\b|\bduration-\d+\b/)).toEqual([])
  })

  it('setzen Fokus über den Fokus-Ring der Tokens statt focus:ring-*', () => {
    expect(findInUiFiles(/\bfocus:ring-/)).toEqual([])
  })

  it('bleiben in der Token-Skala text-xs … text-3xl (kein text-base, keine Pixelwerte)', () => {
    expect(
      findInUiFiles(
        /\btext-(?:base|[4-9]xl)\b|\btext-\[[^\]]+\]|\bleading-(?:relaxed|snug|loose)\b/,
      ),
    ).toEqual([])
  })

  it('nutzen keine Unicode-Statuszeichen als Icons (✓ ✕ ⚠ ℹ)', () => {
    // Nur Templates prüfen; Kommentare dürfen die Zeichen erwähnen
    const vueOnly = UI_FILES.filter((file) => file.endsWith('.vue'))
    const hits = vueOnly.filter((file) => {
      const template =
        readFileSync(file, 'utf8').match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''
      return /[✓✕✗⚠ℹ]|&#(?:10003|10007|9888|8505);/.test(template.replace(/<!--[\s\S]*?-->/g, ''))
    })
    expect(hits.map((file) => relative(SRC_DIR, file))).toEqual([])
  })

  it('haben in Vue-Styles und Stylesheets keine festen Farbwerte (nur Tokens)', () => {
    const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')
    const hits = UI_FILES.flatMap((file) => {
      const source = withoutComments(readFileSync(file, 'utf8'))
      const styles = file.endsWith('.vue')
        ? [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1])
        : [source]
      return styles.flatMap((css) =>
        (css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).map(
          (value) => `${relative(SRC_DIR, file)}: ${value}`,
        ),
      )
    })
    expect(hits).toEqual([])
  })
})

describe('Typografie-Brücke', () => {
  it.each(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'])(
    'text-%s kommt aus dem gleichnamigen Token',
    (step) => {
      expect(tailwindConfig).toMatch(new RegExp(`'?${step}'?: \\['var\\(--ds-text-${step}\\)'`))
    },
  )

  it('bindet Schriftfamilie, Gewichte, Zeilenhöhen und Tracking an Tokens', () => {
    expect(tailwindConfig).toContain("sans: 'var(--ds-font-sans)'")
    expect(tailwindConfig).toContain("semibold: 'var(--ds-weight-semibold)'")
    expect(tailwindConfig).toContain("tight: 'var(--ds-leading-tight)'")
    expect(tailwindConfig).toContain("tight: 'var(--ds-tracking-tight)'")
  })

  it('setzt die Grundgröße des Body wie der Collage Maker auf --ds-text-lg', () => {
    expect(foundationCss).toMatch(/body \{[^}]*font-size: var\(--ds-text-lg\)/)
  })
})

describe('UI-Schrift Supreme', () => {
  it.each([400, 500, 700])('deklariert @font-face für Gewicht %i', (weight) => {
    const faces = foundationCss.match(/@font-face\s*{[^}]*}/g) ?? []
    const supremeFaces = faces.filter((face) => /font-family:\s*'Supreme'/.test(face))
    const match = supremeFaces.find((face) => new RegExp(`font-weight:\\s*${weight}\\b`).test(face))
    expect(match, `Kein @font-face für Supreme ${weight}`).toBeDefined()
    expect(match).toMatch(/\.\.\/assets\/fonts\/Supreme-(Regular|Medium|Bold)\.woff2/)
  })

  it.each(['Regular', 'Medium', 'Bold'])('bündelt Supreme-%s.woff2 im Repo', (cut) => {
    const file = join(SRC_DIR, 'assets', 'fonts', `Supreme-${cut}.woff2`)
    expect(statSync(file).size).toBeGreaterThan(1000)
  })
})

describe('Theme-Mechanik in app.html', () => {
  const appHtml = readFileSync(join(ROOT_DIR, 'app.html'), 'utf8')

  it('setzt data-theme vor dem ersten Paint, bevor das App-Skript lädt', () => {
    const prePaint = appHtml.indexOf("setAttribute('data-theme'")
    const appScript = appHtml.indexOf('src="/src/main.js"')
    expect(prePaint).toBeGreaterThan(-1)
    expect(appScript).toBeGreaterThan(prePaint)
  })

  it('bindet die SSI-Partials außerhalb von #app ein', () => {
    expect(appHtml).toMatch(/<!--#include virtual="\/partials\/nav\.html" -->\s*<div id="app">/)
    expect(appHtml).toContain('<!--#include virtual="/partials/footer.html" -->')
    expect(appHtml).toContain('<!--#include virtual="/partials/cookie-banner.html" -->')
  })
})

describe('Landing-Seite (index.html)', () => {
  const indexHtml = readFileSync(join(ROOT_DIR, 'index.html'), 'utf8')
  const landingCss = readFileSync(join(SRC_DIR, 'landing', 'landing.css'), 'utf8')
  const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')

  it('hat kein eigenes Inline-CSS mehr und lädt das Token-Stylesheet', () => {
    expect(indexHtml).not.toMatch(/<style[\s>]/)
    expect(indexHtml).not.toMatch(/\sstyle="/)
    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/landing/landing.css" />')
  })

  it('setzt data-theme vor dem ersten Paint, vor dem Stylesheet', () => {
    const prePaint = indexHtml.indexOf("setAttribute('data-theme'")
    const stylesheet = indexHtml.indexOf('/src/landing/landing.css')
    expect(prePaint).toBeGreaterThan(-1)
    expect(stylesheet).toBeGreaterThan(prePaint)
  })

  it('hält body.light-theme und html.dark wie die App synchron', () => {
    expect(indexHtml).toContain("document.body.classList.toggle('light-theme', theme === 'light')")
    expect(indexHtml).toContain(
      "document.documentElement.classList.toggle('dark', theme === 'dark')",
    )
  })

  it('legt den Seiteninhalt in #app, damit die Partial-Regeln nur Nav/Footer treffen', () => {
    expect(indexHtml).toMatch(
      /<!--#include virtual="\/partials\/nav\.html" -->[\s\S]*?<main id="app" class="landing">/,
    )
    const mainEnd = indexHtml.indexOf('</main>')
    expect(mainEnd).toBeGreaterThan(-1)
    expect(indexHtml.indexOf('<!--#include virtual="/partials/footer.html" -->')).toBeGreaterThan(
      mainEnd,
    )
  })

  it('nutzt keine alten Variablen, Gradients, Blur, Glow, Lifts oder Karten-Schatten', () => {
    const css = withoutComments(landingCss)
    expect(css).not.toMatch(
      /var\(--(?:accent|secondary|muted|neutral|dark|bg-|text-primary|text-secondary|text-muted|border-color)/,
    )
    expect(css).not.toMatch(/gradient\(|blur\(|backdrop-filter|box-shadow:\s*0 \d/)
    expect(css).not.toMatch(/:hover\s*\{[^}]*transform/)
    expect(css).not.toMatch(/\bfont-weight:\s*\d/)
  })

  it('nutzt nur Variablen, die in den Tokens definiert sind', () => {
    const tokensCss = readFileSync(join(SRC_DIR, 'design-system', 'tokens-v2.css'), 'utf8')
    const defined = new Set(tokensCss.match(/--ds-[a-z0-9-]+(?=\s*:)/g))
    const used = new Set(withoutComments(landingCss).match(/--ds-[a-z0-9-]+/g))
    expect([...used].filter((variable) => !defined.has(variable))).toEqual([])
  })
})
