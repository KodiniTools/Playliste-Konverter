import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // Theme und Locale werden von der externen SSI-Navigation (nav.html) gesteuert.
  // Theme-Mechanik wie im Collage Maker: html[data-theme] schaltet die
  // Design-Tokens (--ds-*) und die SSI-Partials, body.light-theme hält Parität
  // zum Playlist Generator, html.dark bleibt als Altbestand für externe Skripte.

  const theme = ref(normalizeTheme(readInitialTheme()))
  const locale = ref(localStorage.getItem('locale') || 'de')

  // nav.html bzw. das Pre-Paint-Skript in app.html hat data-theme womöglich schon gesetzt
  function readInitialTheme() {
    return (
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('theme') ||
      'light'
    )
  }

  function applyTheme(newTheme) {
    document.documentElement.setAttribute('data-theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    document.body?.classList.toggle('light-theme', newTheme === 'light')
    try {
      localStorage.setItem('theme', newTheme)
    } catch {
      // Privater Modus / blockierter Speicher: Theme gilt dann nur für diese Sitzung
    }
  }

  watch(theme, applyTheme, { immediate: true })

  // Flag: unterdrückt Re-Dispatch wenn Sprachänderung von externem Event kam
  let _suppressDispatch = false

  // data-lang-* Elemente aktualisieren (SSI-Übersetzungsmuster:
  // <span data-lang-de="Deutsch" data-lang-en="English"></span>)
  function updateDataLangElements(lang) {
    const attr = `data-lang-${lang}`
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      el.textContent = el.getAttribute(attr)
    })
  }

  // Locale watcher - synchronisiert lang-Attribut, dispatcht Event, aktualisiert data-lang-*
  watch(
    locale,
    (newLocale) => {
      document.documentElement.setAttribute('lang', newLocale)

      // Event nur dispatchen wenn Änderung nicht von externem SSI-Event kam
      if (!_suppressDispatch) {
        window.dispatchEvent(
          new CustomEvent('locale-changed', {
            detail: { locale: newLocale },
          }),
        )
      }
      _suppressDispatch = false

      // SSI-Partials aktualisieren: Footer/Cookie-Banner (data-lang-*)
      // Navigation übersetzt sich selbst via applyTranslations()
      updateDataLangElements(newLocale)
    },
    { immediate: true },
  )

  // nav.html setzt data-theme direkt, dispatcht aber KEIN Event.
  // MutationObserver erkennt Änderungen am data-theme Attribut. Eigene Änderungen
  // fallen über den Vergleich mit theme.value heraus (Observer läuft asynchron).
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
        const newTheme = normalizeTheme(document.documentElement.getAttribute('data-theme'))
        if (newTheme !== theme.value) {
          theme.value = newTheme
        }
      }
    }
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  // nav.html dispatcht 'locale-changed' mit { detail: { locale: 'de'|'en' } }
  function onLocaleChanged(event) {
    const newLang = event.detail?.locale
    if (newLang && newLang !== locale.value) {
      _suppressDispatch = true
      locale.value = newLang
    }
  }

  window.addEventListener('locale-changed', onLocaleChanged)

  function setLocale(newLocale) {
    locale.value = newLocale
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  return {
    theme,
    locale,
    setLocale,
    toggleTheme,
  }
})

/** Nur 'dark' und 'light' sind gültig; alles andere fällt auf den Standard Light zurück. */
export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light'
}
