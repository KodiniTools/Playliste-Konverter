/**
 * Einstellungen der App im localStorage – unter eigenem Präfix.
 *
 * localStorage gilt für die ganze Domain kodinitools.com, also für alle Tools
 * gleichzeitig. Allgemeine Schlüssel wie "playerVolume" können von anderen
 * Tools mit anderer Bedeutung (z. B. Lautstärke 0–100) überschrieben werden.
 * Deshalb liest und schreibt die App ihre eigenen Werte unter
 * "playlistkonverter.<name>". Ein früher ungepräfixt gespeicherter Wert wird
 * nur als Fallback gelesen – der Aufrufer prüft ihn wie jeden anderen Wert.
 * theme/locale bleiben bewusst ungepräfixt: sie teilt die App mit der SSI-Navigation.
 */

export const STORAGE_PREFIX = 'playlistkonverter.'

/**
 * Eigenen Wert lesen; fehlt er, den früheren ungepräfixten Schlüssel.
 * Gesperrter Speicher (privater Modus) liefert null.
 * @param {string} name
 * @returns {string|null}
 */
export function readPref(name) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + name) ?? localStorage.getItem(name)
  } catch {
    return null
  }
}

/**
 * Eigenen Wert schreiben (Fehler wie voller oder gesperrter Speicher werden ignoriert).
 * @param {string} name
 * @param {string|number} value
 */
export function writePref(name, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, String(value))
  } catch {
    // Einstellung gilt dann nur für diese Sitzung
  }
}
