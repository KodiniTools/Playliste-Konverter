<script setup>
import { useConverterStore } from '../stores/converter'

const store = useConverterStore()

async function handleDownload() {
  try {
    // Prüfe ob File System Access API verfügbar ist
    if ('showSaveFilePicker' in window) {
      // Moderne Browser: Zeige "Speichern unter"-Dialog
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: 'playlist.webm',
        types: [{
          description: 'WebM Audio',
          accept: { 'audio/webm': ['.webm'] }
        }]
      })

      // Lade die Datei vom Backend
      const response = await fetch(store.downloadUrl)
      const blob = await response.blob()

      // Schreibe in die ausgewählte Datei
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      console.log('Datei erfolgreich gespeichert!')
    } else {
      // Fallback für ältere Browser
      window.location.href = store.downloadUrl
    }
  } catch (err) {
    // Benutzer hat den Dialog abgebrochen oder Fehler aufgetreten
    if (err.name !== 'AbortError') {
      console.error('Download-Fehler:', err)
      // Fallback bei Fehler
      window.location.href = store.downloadUrl
    }
  }
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6 text-center">
    <svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 class="text-xl font-semibold text-gray-900 mb-2">Konvertierung abgeschlossen!</h3>
    <p class="text-gray-600 mb-6">Deine Playlist ist bereit zum Download</p>
    
    <button
      @click="handleDownload"
      class="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold cursor-pointer"
    >
      playlist.webm herunterladen
    </button>

    <button
      @click="store.reset"
      class="block mx-auto mt-4 text-sm text-gray-600 hover:underline"
    >
      Neue Konvertierung starten
    </button>
  </div>
</template>
