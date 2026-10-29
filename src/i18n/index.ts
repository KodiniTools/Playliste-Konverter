import { createI18n } from 'vue-i18n'
// Übersetzungen als JSON: @intlify/unplugin-vue-i18n kompiliert sie beim Build
// vor, damit die App den kleineren Runtime-Build von vue-i18n nutzen kann.
import de from './locales/de.json'
import en from './locales/en.json'
import { readSharedPref } from '../utils/storage'

export type LocaleName = 'de' | 'en'

/** Nur 'de' und 'en' sind gültig; alles andere (z. B. 'fr' eines anderen Tools) → 'de'. */
export function normalizeLocale(value: unknown): LocaleName {
  return value === 'en' ? 'en' : 'de'
}

const i18n = createI18n({
  legacy: false,
  locale: normalizeLocale(readSharedPref('locale')),
  fallbackLocale: 'de',
  messages: { de, en },
})

export default i18n
