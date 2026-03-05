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

  // Flag: unterdrückt Re-Dispatch wenn Sprachänderung von externem Event kam
  let _suppressDispatch = false

  // data-lang-* Elemente aktualisieren (SSI-Übersetzungsmuster:
  // <span data-lang-de="Deutsch" data-lang-en="English"></span>)
  function updateDataLangElements(lang) {
    const attr = `data-lang-${lang}`
    document.querySelectorAll(`[${attr}]`).forEach(el => {
      el.textContent = el.getAttribute(attr)
    })
  }

  // data-nav-i18n Elemente aktualisieren (SSI-Navigation:
  // <a data-nav-i18n="key" data-nav-title-de="..." data-nav-title-en="...">)
  function updateNavI18nElements(lang) {
    document.querySelectorAll('[data-nav-i18n]').forEach(el => {
      // textContent aus data-nav-text-{lang}
      const text = el.getAttribute(`data-nav-text-${lang}`)
      if (text) el.textContent = text

      // title-Attribut aus data-nav-title-{lang}
      const title = el.getAttribute(`data-nav-title-${lang}`)
      if (title) el.setAttribute('title', title)

      // aria-label aus data-nav-aria-{lang}
      const aria = el.getAttribute(`data-nav-aria-${lang}`)
      if (aria) el.setAttribute('aria-label', aria)
    })
  }

  // Locale watcher - synchronisiert lang-Attribut, dispatcht Event, aktualisiert data-lang-*
  watch(locale, (newLocale) => {
    document.documentElement.setAttribute('lang', newLocale)

    // Event nur dispatchen wenn Änderung nicht von externem SSI-Event kam
    if (!_suppressDispatch) {
      window.dispatchEvent(new CustomEvent('language-changed', {
        detail: { lang: newLocale }
      }))
    }
    _suppressDispatch = false

    // SSI-Partials aktualisieren: Footer/Cookie-Banner + Navigation
    updateDataLangElements(newLocale)
    updateNavI18nElements(newLocale)
  }, { immediate: true })

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
      _suppressDispatch = true
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
