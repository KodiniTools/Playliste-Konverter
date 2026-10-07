<script setup>
  import { computed } from 'vue'
  import { useConverterStore } from '../stores/converter'
  import { useI18n } from 'vue-i18n'
  import { formatBytes } from '../utils/format'
  import { OUTPUT_FORMATS } from '../constants'
  import StatusIcon from './StatusIcon.vue'

  const store = useConverterStore()
  const { t } = useI18n()

  const currentFormat = computed(() => store.outputFormat || 'mp3')
  const formatConfig = computed(() => OUTPUT_FORMATS[currentFormat.value] || OUTPUT_FORMATS.mp3)

  async function handleDownload() {
    const config = formatConfig.value
    const filename = `playlist.${config.extension}`

    try {
      // Prüfe ob File System Access API verfügbar ist
      if ('showSaveFilePicker' in window) {
        // Moderne Browser: Zeige "Speichern unter"-Dialog
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: config.description,
              accept: { [config.mimeType]: ['.' + config.extension] },
            },
          ],
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
  <section class="rounded-lg border border-line bg-surface-1 p-4 text-center sm:p-6">
    <StatusIcon type="success" class="mx-auto mb-3 h-12 w-12 sm:mb-4 sm:h-16 sm:w-16" />
    <h3 class="mb-2 text-xl font-semibold text-ink">
      {{ t('download.title') }}
    </h3>
    <p class="mb-2 text-md text-ink-2 sm:text-lg">
      {{ t('download.subtitle') }}
    </p>
    <p v-if="store.outputFileSize" class="mb-6 text-sm tabular-nums text-ink-3">
      {{ t('download.fileSize') }}: {{ formatBytes(store.outputFileSize) }}
    </p>
    <p v-else class="mb-6 text-sm text-ink-3">&nbsp;</p>

    <button
      type="button"
      class="inline-flex h-control-lg items-center rounded-md bg-accent px-6 text-md font-semibold text-on-accent transition-colors hover:bg-accent-hover"
      @click="handleDownload"
    >
      {{ t('download.button', { format: currentFormat }) }}
    </button>

    <button
      type="button"
      class="mx-auto mt-4 block rounded-sm px-2 text-md text-ink-2 transition-colors hover:text-ink hover:underline"
      @click="store.reset"
    >
      {{ t('download.newConversion') }}
    </button>
  </section>
</template>
