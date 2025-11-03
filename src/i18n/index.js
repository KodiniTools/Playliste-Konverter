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
    },
    faq: {
      title: 'Häufig gestellte Fragen (FAQ)',
      questions: [
        {
          q: 'Was macht dieser Konverter?',
          a: 'Dieser Konverter kombiniert mehrere Audio-Dateien (MP3 oder WAV) in eine einzige WebM-Datei. Die Tracks werden in der von Ihnen festgelegten Reihenfolge zusammengefügt.'
        },
        {
          q: 'Welche Audioformate werden unterstützt?',
          a: 'Aktuell werden MP3 und WAV Dateien unterstützt. Diese sind die gängigsten Audioformate und decken die meisten Anwendungsfälle ab.'
        },
        {
          q: 'Wie viele Dateien kann ich gleichzeitig konvertieren?',
          a: 'Sie können bis zu 50 Audio-Tracks gleichzeitig hochladen und konvertieren. Die Dateien werden in der Reihenfolge zusammengefügt, die Sie durch Drag & Drop festlegen.'
        },
        {
          q: 'Gibt es eine Größenbeschränkung?',
          a: 'Die maximale Dateigröße hängt von Ihrer Internetverbindung und dem Server ab. Sehr große Dateien können länger zum Hochladen und Konvertieren benötigen.'
        },
        {
          q: 'Wie lange dauert die Konvertierung?',
          a: 'Die Dauer hängt von der Anzahl und Größe Ihrer Dateien ab. Kleine Playlists werden in wenigen Sekunden konvertiert, größere können einige Minuten dauern.'
        },
        {
          q: 'Werden meine Dateien gespeichert?',
          a: 'Nein, aus Datenschutzgründen werden alle hochgeladenen Dateien und das konvertierte Ergebnis nach kurzer Zeit automatisch vom Server gelöscht.'
        },
        {
          q: 'Kann ich die Reihenfolge der Tracks ändern?',
          a: 'Ja! Sie können die Tracks per Drag & Drop in der Liste verschieben, bevor Sie die Konvertierung starten.'
        },
        {
          q: 'Was ist das WebM-Format?',
          a: 'WebM ist ein offenes, lizenzfreies Medienformat, das von vielen modernen Browsern und Media-Playern unterstützt wird. Es bietet gute Qualität bei kompakter Dateigröße.'
        }
      ]
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
    },
    faq: {
      title: 'Frequently Asked Questions (FAQ)',
      questions: [
        {
          q: 'What does this converter do?',
          a: 'This converter combines multiple audio files (MP3 or WAV) into a single WebM file. The tracks are merged in the order you specify.'
        },
        {
          q: 'Which audio formats are supported?',
          a: 'Currently, MP3 and WAV files are supported. These are the most common audio formats and cover most use cases.'
        },
        {
          q: 'How many files can I convert at once?',
          a: 'You can upload and convert up to 50 audio tracks simultaneously. The files will be merged in the order you set via drag & drop.'
        },
        {
          q: 'Is there a size limit?',
          a: 'The maximum file size depends on your internet connection and the server. Very large files may take longer to upload and convert.'
        },
        {
          q: 'How long does the conversion take?',
          a: 'The duration depends on the number and size of your files. Small playlists are converted in seconds, larger ones may take a few minutes.'
        },
        {
          q: 'Are my files stored?',
          a: 'No, for privacy reasons all uploaded files and the converted result are automatically deleted from the server after a short time.'
        },
        {
          q: 'Can I change the order of tracks?',
          a: 'Yes! You can reorder tracks via drag & drop in the list before starting the conversion.'
        },
        {
          q: 'What is the WebM format?',
          a: 'WebM is an open, royalty-free media format supported by many modern browsers and media players. It offers good quality with compact file size.'
        }
      ]
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
