<script setup>
import { computed } from 'vue'
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()

// Format-Konfigurationen für File Picker
const formatConfigs = {
  webm: { description: 'WebM Audio', mimeType: 'audio/webm', extension: '.webm' },
  mp3: { description: 'MP3 Audio', mimeType: 'audio/mpeg', extension: '.mp3' },
  ogg: { description: 'OGG Audio', mimeType: 'audio/ogg', extension: '.ogg' }
}

const currentFormat = computed(() => store.outputFormat || 'mp3')
const formatConfig = computed(() => formatConfigs[currentFormat.value] || formatConfigs.mp3)

function formatFileSize(bytes) {
  if (!bytes) return null
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + ' GB'
  }
  return mb.toFixed(2) + ' MB'
}

async function handleDownload() {
  const config = formatConfig.value
  const filename = `playlist${config.extension}`

  try {
    // Prüfe ob File System Access API verfügbar ist
    if ('showSaveFilePicker' in window) {
      // Moderne Browser: Zeige "Speichern unter"-Dialog
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: config.description,
          accept: { [config.mimeType]: [config.extension] }
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
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-6 text-center">
    <svg class="mx-auto h-16 w-16 text-accent dark:text-accent-light mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 class="text-xl font-semibold text-dark dark:text-neutral-light mb-2">{{ t('download.title') }}</h3>
    <p class="text-muted dark:text-neutral mb-2">{{ t('download.subtitle') }}</p>
    <p v-if="store.outputFileSize" class="text-sm text-muted-light dark:text-neutral mb-6">
      {{ t('download.fileSize') }}: {{ formatFileSize(store.outputFileSize) }}
    </p>
    <p v-else class="text-sm text-muted-light dark:text-neutral mb-6">&nbsp;</p>

    <button
      @click="handleDownload"
      class="inline-block bg-accent dark:bg-accent text-dark px-6 py-3 rounded-lg hover:bg-accent-dark dark:hover:bg-accent-dark font-semibold transition-colors cursor-pointer shadow-sm hover:shadow-md"
    >
      {{ t('download.button', { format: currentFormat }) }}
    </button>

    <button
      @click="store.reset"
      class="block mx-auto mt-4 text-sm text-muted dark:text-neutral hover:underline"
    >
      {{ t('download.newConversion') }}
    </button>
  </div>
</template>
