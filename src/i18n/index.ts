import { createI18n } from 'vue-i18n'
// Übersetzungen als JSON: @intlify/unplugin-vue-i18n kompiliert sie beim Build
// vor, damit die App den kleineren Runtime-Build von vue-i18n nutzen kann.
import de from './locales/de.json'
import en from './locales/en.json'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'de',
  fallbackLocale: 'de',
  messages: { de, en },
})

export default i18n
