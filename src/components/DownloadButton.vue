<script setup lang="ts">
  import { computed, ref, onBeforeUnmount } from 'vue'
  import { useConverterStore } from '../stores/converter'
  import { useToastStore } from '../stores/toast'
  import { useI18n } from 'vue-i18n'
  import { formatBytes } from '../utils/format'
  import { OUTPUT_FORMATS, MUSIC_PLAYER_SHARE_URL } from '../constants'
  import { replaceSharedFiles } from '../utils/sharedFileRepository'
  import { errorName } from '../utils/errors'
  import StatusIcon from './StatusIcon.vue'
  import { logger } from '../utils/logger'

  const store = useConverterStore()
  const toast = useToastStore()
  const { t } = useI18n()

  // Der Server löscht die Session nach dem ersten vollständigen Download.
  // Einmal geladen, wird die Datei deshalb hier zwischengespeichert, damit
  // Download und Weitergabe an den Musikplayer beide (in beliebiger
  // Reihenfolge) funktionieren.
  let outputBlob: Blob | null = null
  let outputBlobPromise: Promise<Blob> | null = null
  let objectUrl: string | null = null

  /** Download-URL der fertigen Datei (die Komponente erscheint erst im Status done). */
  function downloadUrl(): string {
    return store.downloadUrl ?? ''
  }

  function fetchOutputBlob(): Promise<Blob> {
    if (outputBlob) return Promise.resolve(outputBlob)
    if (!outputBlobPromise) {
      outputBlobPromise = fetch(downloadUrl())
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then((blob) => {
          outputBlob = blob
          return blob
        })
        .finally(() => {
          outputBlobPromise = null
        })
    }
    return outputBlobPromise
  }

  function downloadCachedBlob(blob: Blob, filename: string) {
    if (!objectUrl) objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  onBeforeUnmount(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })

  const currentFormat = computed(() => store.outputFormat || 'mp3')
  const formatConfig = computed(() => OUTPUT_FORMATS[currentFormat.value] ?? OUTPUT_FORMATS.mp3)

  async function handleDownload() {
    const config = formatConfig.value
    const filename = `playlist.${config.extension}`

    try {
      // Prüfe ob File System Access API verfügbar ist
      if (window.showSaveFilePicker) {
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

        // Lade die Datei vom Backend (bzw. aus dem Zwischenspeicher)
        const blob = await fetchOutputBlob()

        // Schreibe in die ausgewählte Datei
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()

        logger.info('Datei gespeichert')
      } else if (outputBlob) {
        // Datei wurde bereits für den Musikplayer geladen – Session ist evtl. schon weg
        downloadCachedBlob(outputBlob, filename)
      } else {
        // Fallback für ältere Browser
        window.location.href = downloadUrl()
      }
    } catch (err) {
      // Benutzer hat den Dialog abgebrochen oder Fehler aufgetreten
      if (errorName(err) !== 'AbortError') {
        logger.error('Download fehlgeschlagen:', err)
        // Fallback bei Fehler
        if (outputBlob) downloadCachedBlob(outputBlob, filename)
        else window.location.href = downloadUrl()
      }
    }
  }

  const sharing = ref(false)

  /**
   * Übergibt die konvertierte Playlist über die gemeinsame IndexedDB an den
   * Ultimativen Musikplayer und öffnet ihn in einem neuen Tab.
   */
  async function handleShareToPlayer() {
    if (sharing.value) return
    sharing.value = true

    // Tab synchron im Klick öffnen, sonst blockiert der Popup-Blocker.
    const playerWindow = window.open('about:blank', '_blank')

    try {
      const config = formatConfig.value
      const blob = await fetchOutputBlob()
      await replaceSharedFiles([
        { blob, name: `playlist.${config.extension}`, mimeType: config.mimeType },
      ])

      if (playerWindow) {
        playerWindow.opener = null
        playerWindow.location.href = MUSIC_PLAYER_SHARE_URL
      } else {
        window.location.href = MUSIC_PLAYER_SHARE_URL
      }
    } catch (err) {
      logger.error('Weitergabe an den Musikplayer fehlgeschlagen:', err)
      playerWindow?.close()
      toast.error(t('download.shareError'))
    } finally {
      sharing.value = false
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

    <div class="mt-3">
      <button
        type="button"
        class="inline-flex h-control-lg items-center rounded-md border border-line bg-surface-1 px-6 text-md font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
        :disabled="sharing"
        :aria-busy="sharing"
        data-testid="share-to-player"
        @click="handleShareToPlayer"
      >
        {{ sharing ? t('download.sharing') : t('download.shareToPlayer') }}
      </button>
    </div>

    <button
      type="button"
      class="mx-auto mt-4 block rounded-sm px-2 text-md text-ink-2 transition-colors hover:text-ink hover:underline"
      @click="store.reset"
    >
      {{ t('download.newConversion') }}
    </button>
  </section>
</template>
