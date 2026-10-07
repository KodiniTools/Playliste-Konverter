/**
 * Theme-Mechanik des UI-Stores (wie im Collage Maker): html[data-theme] für
 * Tokens und SSI-Partials, body.light-theme als Parität zum Playlist Generator,
 * html.dark als Altbestand; Änderungen der SSI-Navigation am data-theme-Attribut
 * werden übernommen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore, normalizeTheme } from '../stores/ui'

/** MutationObserver-Callbacks laufen als Microtask */
const flushObserver = () => new Promise((resolve) => setTimeout(resolve, 0))

function resetDom() {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.className = ''
  document.body.className = ''
}

describe('UI-Store: Theme-Mechanik', () => {
  beforeEach(() => {
    resetDom()
    setActivePinia(createPinia())
  })

  it('startet ohne Vorgabe im Light-Theme und setzt alle drei Marker', () => {
    const ui = useUIStore()
    expect(ui.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.body.classList.contains('light-theme')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('übernimmt das vom Pre-Paint-Skript gesetzte data-theme vor localStorage', () => {
    localStorage.setItem('theme', 'light')
    document.documentElement.setAttribute('data-theme', 'dark')
    const ui = useUIStore()
    expect(ui.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.body.classList.contains('light-theme')).toBe(false)
  })

  it('fällt bei ungültigem Wert auf Light zurück', () => {
    localStorage.setItem('theme', 'sepia')
    const ui = useUIStore()
    expect(ui.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggleTheme schaltet um und schreibt localStorage', async () => {
    const ui = useUIStore()
    ui.toggleTheme()
    await nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.body.classList.contains('light-theme')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('folgt der SSI-Navigation, wenn sie data-theme direkt ändert', async () => {
    const ui = useUIStore()
    document.documentElement.setAttribute('data-theme', 'dark')
    await flushObserver()
    expect(ui.theme).toBe('dark')
    await nextTick()
    expect(document.body.classList.contains('light-theme')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('normalizeTheme kennt nur dark und light', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme(null)).toBe('light')
    expect(normalizeTheme('')).toBe('light')
  })
})
