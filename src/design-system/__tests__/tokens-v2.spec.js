import { describe, expect, it } from 'vitest'
import tokens from '../tokens-v2.json'
import {
  breakpointsV2,
  colorCssVarV2,
  colorTokenV2,
  controlSizesV2,
  cssVarV2,
  themeColorsV2,
} from '../tokens-v2'
import { collectTokens, contrastRatio, normalize, parseBlock, readRelative } from './tokenTestUtils'

const base = import.meta.url
const v2Css = readRelative(base, '../tokens-v2.css')
const styleCss = readRelative(base, '../../style.css')
const tailwindConfig = readRelative(base, '../../../tailwind.config.js')

const rootBlock = parseBlock(v2Css, ':root', 'tokens-v2.css')
const lightBlock = parseBlock(v2Css, '.light-theme', 'tokens-v2.css')
const dataThemeLightBlock = parseBlock(v2Css, ":root[data-theme='light']", 'tokens-v2.css')
const allTokens = collectTokens(tokens)
const withCss = allTokens.filter((token) => token.cssVar !== undefined)

const THEMES = ['dark', 'light']
const TEXT_TOKENS = ['text', 'text2', 'text3']
const SURFACE_TOKENS = ['surface0', 'surface1', 'surface2']
const STATUS_TOKENS = ['success', 'warning', 'danger', 'info', 'link']
const AA = 4.5

describe('tokens-v2.json ↔ tokens-v2.css', () => {
  it('definiert jedes Token mit CSS-Variable im passenden Block mit identischem Wert', () => {
    expect(withCss.length).toBeGreaterThan(80)
    const mismatches = withCss.flatMap((token) => {
      const block = token.path.includes('light') ? lightBlock : rootBlock
      const actual = block[token.cssVar]
      const expected = normalize(token.value)
      return actual === expected
        ? []
        : [`${token.path} (${token.cssVar}): css=${actual} json=${expected}`]
    })
    expect(mismatches).toEqual([])
  })

  it('hat in :root keine Variable ohne JSON-Eintrag', () => {
    const declared = new Set(withCss.map((token) => token.cssVar))
    expect(Object.keys(rootBlock).filter((variable) => !declared.has(variable))).toEqual([])
  })

  it('hat für Dark und Light dieselben Farb- und Effekt-Tokens', () => {
    expect(Object.keys(tokens.color.light).sort()).toEqual(Object.keys(tokens.color.dark).sort())
    expect(Object.keys(tokens.effect.light).sort()).toEqual(Object.keys(tokens.effect.dark).sort())
  })

  it('spiegelt html[data-theme=light] vollständig aus .light-theme', () => {
    expect(dataThemeLightBlock).toEqual(lightBlock)
  })

  it('deklariert Composite-Tokens mit var(--ds-…) auch in .light-theme', () => {
    const composites = Object.entries(rootBlock).filter(([, value]) => value.includes('var(--ds-'))
    expect(composites.length).toBeGreaterThan(0)
    const missingInLight = composites
      .filter(([variable]) => lightBlock[variable] === undefined)
      .map(([variable]) => variable)
    expect(missingInLight).toEqual([])
  })
})

describe('Namespace und Einbindung', () => {
  it('nutzt ausschließlich --ds-* Variablen', () => {
    const variables = [...Object.keys(rootBlock), ...Object.keys(lightBlock)]
    expect(variables.filter((variable) => !variable.startsWith('--ds-'))).toEqual([])
  })

  it('wird in style.css vor den Tailwind-Direktiven importiert', () => {
    const importIndex = styleCss.indexOf("@import './design-system/tokens-v2.css';")
    const tailwindIndex = styleCss.indexOf('@tailwind base;')
    expect(importIndex).toBeGreaterThanOrEqual(0)
    expect(tailwindIndex).toBeGreaterThan(importIndex)
  })

  it('wird von der Tailwind-Konfiguration nur über var(--ds-*) referenziert', () => {
    const withoutComments = tailwindConfig.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const hexValues = withoutComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    // Nur Weiß und Schwarz dürfen als feste Werte stehen.
    expect(hexValues.filter((hex) => !['#ffffff', '#000000'].includes(hex.toLowerCase()))).toEqual(
      [],
    )
    const referenced = new Set(withoutComments.match(/var\((--ds-[a-z0-9-]+)\)/g) ?? [])
    expect(referenced.size).toBeGreaterThan(20)
    const undefinedVars = [...referenced]
      .map((expression) => expression.slice(4, -1))
      .filter((variable) => rootBlock[variable] === undefined)
    expect(undefinedVars).toEqual([])
  })
})

describe('Kontrast (WCAG AA, mindestens 4.5:1)', () => {
  it.each(THEMES)('%s: Text 1–3 auf Fläche 0–2', (theme) => {
    const colors = themeColorsV2(theme)
    const failures = TEXT_TOKENS.flatMap((text) =>
      SURFACE_TOKENS.flatMap((surface) => {
        const ratio = contrastRatio(colors[text], colors[surface])
        return ratio >= AA ? [] : [`${text} auf ${surface}: ${ratio.toFixed(2)}`]
      }),
    )
    expect(failures).toEqual([])
  })

  it.each(THEMES)('%s: Text auf Akzent und Akzent-Hover', (theme) => {
    const colors = themeColorsV2(theme)
    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(colors.onAccent, colors.accentHover)).toBeGreaterThanOrEqual(AA)
  })

  it.each(THEMES)('%s: Status- und Linkfarben als Text auf Panel', (theme) => {
    const colors = themeColorsV2(theme)
    const failures = STATUS_TOKENS.flatMap((status) => {
      const ratio = contrastRatio(colors[status], colors.surface1)
      return ratio >= AA ? [] : [`${status} auf surface1: ${ratio.toFixed(2)}`]
    })
    expect(failures).toEqual([])
  })
})

describe('tokens-v2.js', () => {
  it('liefert Farbwerte, Variablennamen und var()-Ausdrücke', () => {
    expect(colorTokenV2('dark', 'accent')).toBe('#d4a257')
    expect(colorTokenV2('light', 'accent')).toBe('#c9984d')
    expect(colorCssVarV2('text2')).toBe('--ds-text-2')
    expect(cssVarV2('text2')).toBe('var(--ds-text-2)')
    expect(cssVarV2('surface1', '#111d33')).toBe('var(--ds-surface-1, #111d33)')
  })

  it('liefert eine flache, unveränderliche Farbkarte je Theme', () => {
    expect(Object.keys(themeColorsV2('dark'))).toEqual(Object.keys(tokens.color.dark))
    expect(themeColorsV2('light').surface0).toBe('#f6f5f1')
    expect(Object.isFrozen(themeColorsV2('dark'))).toBe(true)
  })

  it('liefert Größen und Breakpoints als Zahlen', () => {
    expect(controlSizesV2).toEqual({ sm: 28, md: 36, lg: 40, row: 44 })
    expect(breakpointsV2).toEqual({ phone: 480, tablet: 768, desktop: 1024 })
  })
})
