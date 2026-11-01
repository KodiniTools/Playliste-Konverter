// Titel, Beschreibung, Canonical und hreflang der vier Seiten je Sprache.
// Deutsch ist die URL ohne Parameter, Englisch dieselbe URL mit ?lang=en.
// Ein Inline-Skript im <head> speichert ?lang vor allen Seitenskripten in
// localStorage.locale; dieses Modul setzt danach den <head> und folgt dem
// Event 'locale-changed' (SSI-Navigation bzw. UI-Store der App).
import { applyLocaleHead, isLocale, type Locale, type LocaleMeta } from '../utils/localeSeo'
import { readSharedPref } from '../utils/storage'

export const SITE_URL = 'https://kodinitools.com/playlistkonverter/'

type PageKey = 'index' | 'app' | 'faq' | 'funktion'

export const PAGES: Record<PageKey, { url: string } & Record<Locale, LocaleMeta>> = {
  index: {
    url: SITE_URL,
    de: {
      title: 'Playlist Konverter - Audio-Dateien zusammenfügen',
      description:
        'Konvertiere mehrere Audio-Dateien zu einer einzigen Playlist. Unterstützt MP3, WAV, FLAC, M4A/AAC, OGG und OPUS mit Ausgabe in WebM, MP3 oder OGG.',
    },
    en: {
      title: 'Playlist Converter - Merge Audio Files',
      description:
        'Merge multiple audio files into a single playlist. Supports MP3, WAV, FLAC, M4A/AAC, OGG and OPUS with output as WebM, MP3 or OGG.',
    },
  },
  app: {
    url: `${SITE_URL}app.html`,
    de: {
      title: 'Playlist Konverter – Audio-Dateien zusammenfügen',
      description:
        'Mehrere Audio-Tracks (MP3, WAV, FLAC, M4A, OGG, OPUS) zu einer Datei zusammenfügen, als MP3, WebM (Opus) oder OGG (Vorbis).',
    },
    en: {
      title: 'Playlist Converter – Merge Audio Files',
      description:
        'Merge multiple audio tracks (MP3, WAV, FLAC, M4A, OGG, OPUS) into one file, as MP3, WebM (Opus) or OGG (Vorbis).',
    },
  },
  faq: {
    url: `${SITE_URL}faq.html`,
    de: {
      title: 'FAQ - Playlist Konverter',
      description:
        'Häufig gestellte Fragen zum Playlist Konverter - Audio-Dateien online zusammenfügen.',
    },
    en: {
      title: 'FAQ - Playlist Converter',
      description:
        'Frequently asked questions about the Playlist Converter - merge audio files online.',
    },
  },
  funktion: {
    url: `${SITE_URL}funktion.html`,
    de: {
      title: 'Anleitung - Playlist Konverter',
      description:
        'Detaillierte Anleitung zur Nutzung des Playlist Konverters - Schritt für Schritt erklärt.',
    },
    en: {
      title: 'Guide - Playlist Converter',
      description: 'Detailed guide to using the Playlist Converter - explained step by step.',
    },
  },
}

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
