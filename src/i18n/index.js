import { createI18n } from 'vue-i18n'

const messages = {
  de: {
    app: {
      title: 'Playlist zu WebM Konverter',
      subtitle: 'Bis zu 50 Audio-Tracks in eine WebM-Datei konvertieren',
      warning: '⚠️ Verarbeitung erfolgt auf dem Server'
    },
    uploader: {
      dropText: 'MP3 oder WAV Dateien hier ablegen',
      orText: 'oder',
      selectButton: 'Dateien auswählen'
    },
    fileList: {
      title: 'Playlist',
      tracks: 'Tracks',
      totalSize: 'Gesamtgröße',
      removeAll: 'Alle entfernen'
    },
    conversion: {
      uploading: 'Dateien werden hochgeladen...',
      converting: 'Konvertierung läuft...',
      progress: 'Fortschritt'
    },
    download: {
      title: 'Konvertierung abgeschlossen!',
      subtitle: 'Deine Playlist ist bereit zum Download',
      fileSize: 'Dateigröße',
      button: 'playlist.webm herunterladen',
      newConversion: 'Neue Konvertierung starten',
      promptText: 'Bitte geben Sie den Dateinamen ein:',
      error: 'Download fehlgeschlagen. Bitte versuchen Sie es erneut.'
    },
    button: {
      convert: 'Track(s) konvertieren'
    },
    error: {
      reset: 'Zurücksetzen'
    }
  },
  en: {
    app: {
      title: 'Playlist to WebM Converter',
      subtitle: 'Convert up to 50 audio tracks into one WebM file',
      warning: '⚠️ Processing happens on the server'
    },
    uploader: {
      dropText: 'Drop MP3 or WAV files here',
      orText: 'or',
      selectButton: 'Select files'
    },
    fileList: {
      title: 'Playlist',
      tracks: 'Tracks',
      totalSize: 'Total size',
      removeAll: 'Remove all'
    },
    conversion: {
      uploading: 'Uploading files...',
      converting: 'Converting...',
      progress: 'Progress'
    },
    download: {
      title: 'Conversion completed!',
      subtitle: 'Your playlist is ready for download',
      fileSize: 'File size',
      button: 'Download playlist.webm',
      newConversion: 'Start new conversion',
      promptText: 'Please enter the filename:',
      error: 'Download failed. Please try again.'
    },
    button: {
      convert: 'Convert track(s)'
    },
    error: {
      reset: 'Reset'
    }
  }
}

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'de',
  fallbackLocale: 'de',
  messages
})

export default i18n
