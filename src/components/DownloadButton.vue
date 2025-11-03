<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()

function formatFileSize(bytes) {
  if (!bytes) return null
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + ' GB'
  }
  return mb.toFixed(2) + ' MB'
}

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
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
    <svg class="mx-auto h-16 w-16 text-green-500 dark:text-green-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{{ t('download.title') }}</h3>
    <p class="text-gray-600 dark:text-gray-400 mb-2">{{ t('download.subtitle') }}</p>
    <p v-if="store.outputFileSize" class="text-sm text-gray-500 dark:text-gray-400 mb-6">
      {{ t('download.fileSize') }}: {{ formatFileSize(store.outputFileSize) }}
    </p>
    <p v-else class="text-sm text-gray-500 dark:text-gray-400 mb-6">&nbsp;</p>

    <button
      @click="handleDownload"
      class="inline-block bg-green-600 dark:bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 font-semibold transition-colors cursor-pointer"
    >
      {{ t('download.button') }}
    </button>

    <button
      @click="store.reset"
      class="block mx-auto mt-4 text-sm text-gray-600 dark:text-gray-400 hover:underline"
    >
      {{ t('download.newConversion') }}
    </button>
  </div>
</template>
