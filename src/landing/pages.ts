// Titel und Beschreibung der vier Seiten je Sprache, ohne Laufzeit-Abhängigkeiten (kein DOM,
// kein Speicher), damit auch der Build (vite.config.js) sie importieren kann. Deutsch steht
// zusätzlich statisch in den HTML-Dateien, Englisch schreibt der Build als *.en.html
// (siehe utils/localizeHtml.ts).
import type { Locale, LocaleMeta } from '../utils/localeSeo'

export const SITE_URL = 'https://kodinitools.com/playlistkonverter/'

export type PageKey = 'index' | 'app' | 'faq' | 'funktion'

export const PAGES: Record<PageKey, { url: string } & Record<Locale, LocaleMeta>> = {
  index: {
    url: SITE_URL,
    de: {
      title: 'MP3 zusammenfügen online – Playlist Konverter | KodiniTools',
      description:
        'Mehrere MP3 zu einer Datei zusammenfügen, kostenlos online: MP3, WAV, FLAC, M4A, OGG und OPUS verbinden, Ausgabe als MP3, WebM oder OGG. Ohne Registrierung.',
    },
    en: {
      title: 'Merge MP3 Files Online – Playlist Converter | KodiniTools',
      description:
        'Merge MP3 files into one online for free: combine MP3, WAV, FLAC, M4A, OGG and OPUS tracks, output as MP3, WebM or OGG. No registration required.',
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
