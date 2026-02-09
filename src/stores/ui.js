import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // Theme und Locale werden von der externen SSI-Navigation (nav.html) gesteuert.
  // Dieser Store synchronisiert den Zustand und hält die Tailwind 'dark' Klasse aktuell.

  const theme = ref(localStorage.getItem('theme') || 'light')
  const locale = ref(localStorage.getItem('locale') || 'de')

  // Sync data-theme Attribut (nav.html) mit Tailwind 'dark' Klasse
  function syncDarkClass(newTheme) {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Initiale Synchronisation: nav.html hat möglicherweise schon data-theme gesetzt
  const initialTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light'
  theme.value = initialTheme
  syncDarkClass(initialTheme)

  // Theme watcher - hält dark-Klasse synchron
  watch(theme, (newTheme) => {
    syncDarkClass(newTheme)
  })

  // Locale watcher
  watch(locale, (newLocale) => {
    document.documentElement.setAttribute('lang', newLocale)
  })

  // Auf Events der externen SSI-Navigation reagieren
  function onThemeChanged(event) {
    const newTheme = event.detail?.theme
    if (newTheme && newTheme !== theme.value) {
      theme.value = newTheme
    }
  }

  function onLanguageChanged(event) {
    const newLang = event.detail?.lang
    if (newLang && newLang !== locale.value) {
      locale.value = newLang
    }
  }

  window.addEventListener('theme-changed', onThemeChanged)
  window.addEventListener('language-changed', onLanguageChanged)

  function setLocale(newLocale) {
    locale.value = newLocale
  }

  return {
    theme,
    locale,
    setLocale
  }
})
