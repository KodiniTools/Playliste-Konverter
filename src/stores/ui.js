import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const theme = ref(localStorage.getItem('theme') || 'light')
  const locale = ref(localStorage.getItem('locale') || 'de')

  // Theme watcher - aktualisiert DOM und localStorage
  watch(theme, (newTheme) => {
    localStorage.setItem('theme', newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, { immediate: true })

  // Locale watcher - speichert in localStorage
  watch(locale, (newLocale) => {
    localStorage.setItem('locale', newLocale)
  })

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  function setLocale(newLocale) {
    locale.value = newLocale
  }

  return {
    theme,
    locale,
    toggleTheme,
    setLocale
  }
})
