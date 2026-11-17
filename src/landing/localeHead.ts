// Titel, Beschreibung, Canonical und hreflang der vier Seiten je Sprache.
// Deutsch ist die URL ohne Parameter, Englisch dieselbe URL mit ?lang=en.
// Ein Inline-Skript im <head> speichert ?lang vor allen Seitenskripten in
// localStorage.locale; dieses Modul setzt danach den <head> und folgt dem
// Event 'locale-changed' (SSI-Navigation bzw. UI-Store der App).
import { applyLocaleHead, isLocale, type Locale } from '../utils/localeSeo'
import { PAGES, SITE_URL, type PageKey } from './pages'
import { readSharedPref } from '../utils/storage'

export { PAGES, SITE_URL, type PageKey }

/** Seite aus dem Pfad, z. B. '/playlistkonverter/faq.html' → 'faq'. */
export function pageFromPath(pathname: string): PageKey {
  const file = pathname.split('/').pop() ?? ''
  if (file === 'app.html') return 'app'
  if (file === 'faq.html') return 'faq'
  if (file === 'funktion.html') return 'funktion'
  return 'index'
}

export function applyPageHead(page: PageKey, locale: Locale): void {
  const meta = PAGES[page]
  applyLocaleHead(meta.url, locale, meta[locale])
}

/** Head jetzt setzen und bei Sprachwechsel aktualisieren. */
export function initLocaleHead(): void {
  const page = pageFromPath(location.pathname)
  const stored = readSharedPref('locale')
  applyPageHead(page, stored === 'en' ? 'en' : 'de')
  window.addEventListener('locale-changed', (event) => {
    const next = (event as CustomEvent<{ locale?: string } | null>).detail?.locale
    if (isLocale(next)) applyPageHead(page, next)
  })
}
