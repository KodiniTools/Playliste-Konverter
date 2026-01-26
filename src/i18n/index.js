import { createI18n } from 'vue-i18n'

const messages = {
  de: {
    app: {
      title: 'Playlist Konverter',
      subtitle: 'Bis zu 50 Audio-Tracks in eine Datei konvertieren'
    },
    format: {
      title: 'Ausgabeformat',
      webm: {
        description: 'Kompakt, modern'
      },
      mp3: {
        description: 'Universell kompatibel'
      },
      ogg: {
        description: 'Open Source'
      }
    },
    bitrate: {
      title: 'Audioqualität',
      hint: 'Höhere Bitrate = bessere Qualität, größere Datei',
      64: 'Niedrig',
      128: 'Standard',
      192: 'Hoch',
      256: 'Sehr hoch',
      320: 'Maximum'
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
    preview: {
      play: 'Track abspielen',
      pause: 'Pausieren'
    },
    conversion: {
      uploading: 'Dateien werden hochgeladen...',
      converting: 'Konvertierung läuft...',
      progress: 'Fortschritt',
      remaining: 'Verbleibend',
      cancel: 'Abbrechen',
      cancelling: 'Wird abgebrochen...'
    },
    download: {
      title: 'Konvertierung abgeschlossen!',
      subtitle: 'Deine Playlist ist bereit zum Download',
      fileSize: 'Dateigröße',
      button: 'playlist.{format} herunterladen',
      newConversion: 'Neue Konvertierung starten',
      promptText: 'Bitte geben Sie den Dateinamen ein:',
      error: 'Download fehlgeschlagen. Bitte versuchen Sie es erneut.'
    },
    button: {
      convert: 'Track(s) konvertieren'
    },
    error: {
      reset: 'Zurücksetzen'
    },
    donate: {
      title: 'Unterstütze dieses Projekt',
      button: 'spenden'
    },
    sizeWarning: {
      title: 'Playlist zu groß!',
      message: 'Die Gesamtgröße Ihrer Playlist überschreitet das Maximum von {maxSize}. Bitte entfernen Sie einige Dateien, um fortzufahren.',
      currentSize: 'Aktuelle Größe',
      maxSize: 'Maximale Größe',
      overBy: 'Überschreitung um'
    },
    sizeOk: {
      title: 'Playlist bereit!',
      message: 'Die Größe Ihrer Playlist liegt innerhalb des zulässigen Limits. Sie können mit der Konvertierung fortfahren.'
    },
    sizeYellowWarning: {
      title: 'Größere Playlist',
      message: 'Ihre Playlist ist relativ groß. Die Konvertierung kann 3-5 Minuten dauern.',
      estimatedTime: 'Geschätzte Zeit: 3-5 Minuten'
    },
    sizeOrangeWarning: {
      title: 'Sehr große Playlist',
      message: 'Ihre Playlist ist sehr groß. Die Konvertierung kann 5-7 Minuten dauern. Bitte haben Sie Geduld.',
      estimatedTime: 'Geschätzte Zeit: 5-7 Minuten'
    }
  },
  en: {
    app: {
      title: 'Playlist Converter',
      subtitle: 'Convert up to 50 audio tracks into one file'
    },
    format: {
      title: 'Output Format',
      webm: {
        description: 'Compact, modern'
      },
      mp3: {
        description: 'Universal compatibility'
      },
      ogg: {
        description: 'Open source'
      }
    },
    bitrate: {
      title: 'Audio Quality',
      hint: 'Higher bitrate = better quality, larger file',
      64: 'Low',
      128: 'Standard',
      192: 'High',
      256: 'Very high',
      320: 'Maximum'
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
    preview: {
      play: 'Play track',
      pause: 'Pause'
    },
    conversion: {
      uploading: 'Uploading files...',
      converting: 'Converting...',
      progress: 'Progress',
      remaining: 'Remaining',
      cancel: 'Cancel',
      cancelling: 'Cancelling...'
    },
    download: {
      title: 'Conversion completed!',
      subtitle: 'Your playlist is ready for download',
      fileSize: 'File size',
      button: 'Download playlist.{format}',
      newConversion: 'Start new conversion',
      promptText: 'Please enter the filename:',
      error: 'Download failed. Please try again.'
    },
    button: {
      convert: 'Convert track(s)'
    },
    error: {
      reset: 'Reset'
    },
    donate: {
      title: 'Support this project',
      button: 'donate'
    },
    sizeWarning: {
      title: 'Playlist too large!',
      message: 'The total size of your playlist exceeds the maximum of {maxSize}. Please remove some files to continue.',
      currentSize: 'Current size',
      maxSize: 'Maximum size',
      overBy: 'Exceeding by'
    },
    sizeOk: {
      title: 'Playlist ready!',
      message: 'Your playlist size is within the allowed limit. You can proceed with the conversion.'
    },
    sizeYellowWarning: {
      title: 'Larger Playlist',
      message: 'Your playlist is relatively large. Conversion may take 3-5 minutes.',
      estimatedTime: 'Estimated time: 3-5 minutes'
    },
    sizeOrangeWarning: {
      title: 'Very Large Playlist',
      message: 'Your playlist is very large. Conversion may take 5-7 minutes. Please be patient.',
      estimatedTime: 'Estimated time: 5-7 minutes'
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
