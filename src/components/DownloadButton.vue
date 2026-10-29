<script setup lang="ts">
  import { computed, ref, onBeforeUnmount } from 'vue'
  import { useConverterStore } from '../stores/converter'
  import { useToastStore } from '../stores/toast'
  import { useI18n } from 'vue-i18n'
  import { formatBytes } from '../utils/format'
  import { OUTPUT_FORMATS, SHARE_TARGETS } from '../constants'
  import type { ShareTarget } from '../constants'
  import { replaceSharedFiles } from '../utils/sharedFileRepository'
  import { buildCueSheet, buildTracklistText } from '../utils/tracklist'
  import { errorName } from '../utils/errors'
  import StatusIcon from './StatusIcon.vue'
  import { logger } from '../utils/logger'

  const store = useConverterStore()
  const toast = useToastStore()
  const { t } = useI18n()

  // Der Server löscht die Session nach dem ersten vollständigen Download.
  // Einmal geladen, wird die Datei deshalb hier vorgehalten, damit Download
  // und Weitergabe (Musikplayer, Normalisierer) in beliebiger Reihenfolge
  // funktionieren. Nach dem Speichern per Dateidialog ist das die gespeicherte
  // Datei auf der Festplatte (File), kein Puffer im Arbeitsspeicher.
  let outputBlob: Blob | null = null
  let outputBlobPromise: Promise<Blob> | null = null
  let savingPromise: Promise<void> | null = null
  let objectUrl: string | null = null

  /** Download-URL der fertigen Datei (die Komponente erscheint erst im Status done). */
  function downloadUrl(): string {
    return store.downloadUrl ?? ''
  }

  /** Ausgabe für die Weitergabe; läuft gerade das Speichern, dessen Ergebnis nutzen. */
  async function fetchOutputBlob(): Promise<Blob> {
    if (savingPromise) await savingPromise.catch(() => {})
    return loadOutputBlob()
  }

  /** Ausgabe als Blob (einmal geladen, danach aus dem Zwischenspeicher). */
  function loadOutputBlob(): Promise<Blob> {
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

  /**
   * Fertige Datei in die gewählte Datei schreiben. Ist sie noch nicht geladen,
   * fließt sie direkt vom Server auf die Festplatte (F10: auch mehrere GB ohne
   * kompletten Puffer im Arbeitsspeicher).
   */
  async function saveToHandle(fileHandle: FileSystemFileHandle) {
    const writable = await fileHandle.createWritable()
    try {
      if (outputBlob || outputBlobPromise) {
        await writable.write(await loadOutputBlob())
        await writable.close()
        return
      }
      const response = await fetch(downloadUrl())
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      // pipeTo schließt die Datei bei Erfolg und bricht sie bei Fehlern ab
      await response.body.pipeTo(writable)
      outputBlob = await fileHandle.getFile()
    } catch (err) {
      await writable.abort().catch(() => {})
      throw err
    }
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
    const filename = store.outputFileName

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

        savingPromise = saveToHandle(fileHandle)
        try {
          await savingPromise
        } finally {
          savingPromise = null
        }

        logger.info('Datei gespeichert')
      } else if (outputBlob) {
        // Datei wurde bereits für eine Weitergabe geladen – Session ist evtl. schon weg
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

  /** Tracklist (N2) als Datei speichern: Text mit Startzeiten oder CUE-Sheet. */
  function downloadTracklist(kind: 'txt' | 'cue') {
    const fileName = store.outputFileName
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const content =
      kind === 'txt'
        ? buildTracklistText(store.chapters)
        : buildCueSheet(store.chapters, {
            fileName,
            title: store.tags.title.trim() || baseName,
            performer: store.tags.artist.trim() || undefined,
          })
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${baseName}.${kind}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  /** Ziel, an das gerade übergeben wird (sperrt beide Buttons). */
  const sharingId = ref<ShareTarget['id'] | null>(null)

  /**
   * Übergibt die konvertierte Playlist über die gemeinsame IndexedDB an ein
   * anderes KodiniTools-Werkzeug (Musikplayer, Normalisierer) und öffnet es
   * in einem neuen Tab.
   */
  async function handleShare(target: ShareTarget) {
    if (sharingId.value) return
    sharingId.value = target.id

    // Tab synchron im Klick öffnen, sonst blockiert der Popup-Blocker.
    const targetWindow = window.open('about:blank', '_blank')

    try {
      const blob = await fetchOutputBlob()
      await replaceSharedFiles([
        { blob, name: store.outputFileName, mimeType: formatConfig.value.mimeType },
      ])

      if (targetWindow) {
        targetWindow.opener = null
        targetWindow.location.href = target.url
      } else {
        window.location.href = target.url
      }
    } catch (err) {
      logger.error(`Weitergabe (${target.id}) fehlgeschlagen:`, err)
      targetWindow?.close()
      toast.error(t('download.shareError', { tool: t(target.toolKey) }))
    } finally {
      sharingId.value = null
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
      {{ t('download.button', { name: store.outputFileName }) }}
    </button>

    <div class="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
      <button
        v-for="target in SHARE_TARGETS"
        :key="target.id"
        type="button"
        class="inline-flex h-control-lg items-center rounded-md border border-line bg-surface-1 px-6 text-md font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
        :disabled="sharingId !== null"
        :aria-busy="sharingId === target.id"
        :data-testid="`share-to-${target.id}`"
        @click="handleShare(target)"
      >
        {{ sharingId === target.id ? t('download.sharing') : t(target.labelKey) }}
      </button>
    </div>

    <p v-if="store.chapters.length > 1" class="mt-4 text-sm text-ink-2" data-testid="tracklist">
      {{ t('download.tracklist', { n: store.chapters.length }) }}
      <button
        type="button"
        class="rounded-sm px-1 font-medium text-link hover:underline"
        data-tracklist="txt"
        @click="downloadTracklist('txt')"
      >
        {{ t('download.tracklistText') }}</button
      ><span aria-hidden="true">·</span
      ><button
        type="button"
        class="rounded-sm px-1 font-medium text-link hover:underline"
        data-tracklist="cue"
        @click="downloadTracklist('cue')"
      >
        {{ t('download.tracklistCue') }}
      </button>
    </p>

    <button
      type="button"
      class="mx-auto mt-4 block rounded-sm px-2 text-md text-ink-2 transition-colors hover:text-ink hover:underline"
      @click="store.reset"
    >
      {{ t('download.newConversion') }}
    </button>
  </section>
</template>
