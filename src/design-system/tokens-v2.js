/**
 * Tokens v2: Zugriff auf tokens-v2.json aus JavaScript.
 * CSS-Namespace --ds-*, Laufzeit-Quelle tokens-v2.css. JS-Port von
 * KodiniTools/collage-maker (src/design-system/tokens-v2.ts, Stand 9dc4eca).
 */
import tokens from './tokens-v2.json'

/** @typedef {'dark' | 'light'} ThemeName */
/** @typedef {keyof typeof tokens.color.dark} ColorTokenV2Name */

/** Die kompletten v2-Tokens, Struktur siehe tokens-v2.json. */
export const designTokensV2 = tokens

/**
 * Farbwert eines v2-Tokens für ein Theme, z. B. colorTokenV2('dark', 'accent') → '#d4a257'.
 * @param {ThemeName} theme
 * @param {ColorTokenV2Name} name
 * @returns {string}
 */
export function colorTokenV2(theme, name) {
  return tokens.color[theme][name].$value
}

/**
 * Flache Farbkarte eines Themes, z. B. für Canvas- oder SVG-Zeichnung.
 * @param {ThemeName} theme
 * @returns {Readonly<Record<ColorTokenV2Name, string>>}
 */
export function themeColorsV2(theme) {
  const source = tokens.color[theme]
  const result = {}
  for (const key of Object.keys(source)) {
    result[key] = source[key].$value
  }
  return Object.freeze(result)
}

/**
 * CSS-Variablenname eines v2-Farb-Tokens, z. B. colorCssVarV2('accent') → '--ds-accent'.
 * @param {ColorTokenV2Name} name
 * @returns {string}
 */
export function colorCssVarV2(name) {
  return tokens.color.dark[name].$extensions.css
}

/**
 * var()-Ausdruck mit optionalem Fallback: cssVarV2('text2') → 'var(--ds-text-2)'.
 * @param {ColorTokenV2Name} name
 * @param {string} [fallback]
 * @returns {string}
 */
export function cssVarV2(name, fallback) {
  const variable = colorCssVarV2(name)
  return fallback === undefined ? `var(${variable})` : `var(${variable}, ${fallback})`
}

/** Control-Höhen in px. */
export const controlSizesV2 = Object.freeze({
  sm: parseInt(tokens.size.control.sm.$value, 10),
  md: parseInt(tokens.size.control.md.$value, 10),
  lg: parseInt(tokens.size.control.lg.$value, 10),
  row: parseInt(tokens.size.row.$value, 10),
})

/** Breakpoints in px für window.matchMedia. */
export const breakpointsV2 = Object.freeze({
  phone: parseInt(tokens.layout.breakpoint.phone.$value, 10),
  tablet: parseInt(tokens.layout.breakpoint.tablet.$value, 10),
  desktop: parseInt(tokens.layout.breakpoint.desktop.$value, 10),
})
