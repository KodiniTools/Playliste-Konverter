<script setup>
import { useConverterStore } from '../stores/converter'
import axios from 'axios'

const store = useConverterStore()

function formatFileSize(bytes) {
  if (!bytes) return null
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + ' GB'
  }
  return mb.toFixed(2) + ' MB'
}

async function handleDownload(e) {
  e.preventDefault()

  // Dialog öffnen für Dateinamen
  const defaultName = 'playlist.webm'
  const filename = prompt('Bitte geben Sie den Dateinamen ein:', defaultName)

  if (!filename) {
    return // Benutzer hat abgebrochen
  }

  // Datei herunterladen
  try {
    const response = await axios.get(store.downloadUrl, {
      responseType: 'blob'
    })

    // Blob erstellen und Download starten
    const blob = new Blob([response.data], { type: 'video/webm' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename.endsWith('.webm') ? filename : filename + '.webm'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Download error:', error)
    alert('Download fehlgeschlagen. Bitte versuchen Sie es erneut.')
  }
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6 text-center">
    <svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 class="text-xl font-semibold text-gray-900 mb-2">Konvertierung abgeschlossen!</h3>
    <p class="text-gray-600 mb-2">Deine Playlist ist bereit zum Download</p>
    <p v-if="store.outputFileSize" class="text-sm text-gray-500 mb-6">
      Dateigröße: {{ formatFileSize(store.outputFileSize) }}
    </p>
    <p v-else class="text-sm text-gray-500 mb-6">&nbsp;</p>

    <button
      @click="handleDownload"
      class="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
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
