<script setup>
  import { ref, onMounted, onUnmounted } from 'vue'
  import { useConverterStore } from '../stores/converter'
  import { useToastStore } from '../stores/toast'
  import { useI18n } from 'vue-i18n'

  const store = useConverterStore()
  const toastStore = useToastStore()
  const { t } = useI18n()
  const isDragging = ref(false)

  async function onDrop(e) {
    isDragging.value = false

    try {
      const items = e.dataTransfer?.items
      if (items && items.length > 0) {
        const files = []
        const promises = []

        for (const item of items) {
          const entry = item.webkitGetAsEntry?.()
          if (entry?.isDirectory) {
            promises.push(readDirectoryEntries(entry, files))
          } else if (entry?.isFile) {
            promises.push(
              new Promise((resolve) => {
                entry.file(
                  (f) => {
                    files.push(f)
                    resolve()
                  },
                  () => {
                    toastStore.warning(t('uploader.errorFileAccess'))
                    resolve()
                  },
                )
              }),
            )
          }
        }

        await Promise.all(promises)
        if (files.length > 0) {
          store.addFiles(files)
          return
        }
      }

      if (e.dataTransfer?.files?.length) {
        store.addFiles(e.dataTransfer.files)
      }
    } catch {
      toastStore.error(t('uploader.errorDrop'))
    }
  }

  function readDirectoryEntries(dirEntry, files) {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader()
      const readBatch = () => {
        reader.readEntries(
          (entries) => {
            if (!entries.length) {
              resolve()
              return
            }
            const promises = entries.map((entry) => {
              if (entry.isDirectory) return readDirectoryEntries(entry, files)
              if (entry.isFile)
                return new Promise((res) => {
                  entry.file(
                    (f) => {
                      files.push(f)
                      res()
                    },
                    () => {
                      toastStore.warning(t('uploader.errorFileAccess'))
                      res()
                    },
                  )
                })
              return Promise.resolve()
            })
            Promise.all(promises).then(readBatch)
          },
          () => {
            toastStore.warning(t('uploader.errorDirectoryAccess'))
            resolve()
          },
        )
      }
      readBatch()
    })
  }

  function onFileSelect(e) {
    try {
      store.addFiles(e.target.files)
    } catch {
      toastStore.error(t('uploader.errorFileSelect'))
    } finally {
      e.target.value = ''
    }
  }

  function onFolderSelect(e) {
    try {
      store.addFiles(e.target.files)
    } catch {
      toastStore.error(t('uploader.errorFileSelect'))
    } finally {
      e.target.value = ''
    }
  }

  function handlePaste(e) {
    try {
      const audioFiles = []

      const items = e.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.kind === 'file') {
            const file = item.getAsFile()
            if (
              file &&
              (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|webm)$/i.test(file.name))
            ) {
              audioFiles.push(file)
            }
          }
        }
      }

      if (audioFiles.length === 0 && e.clipboardData?.files?.length) {
        for (const file of e.clipboardData.files) {
          if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|webm)$/i.test(file.name)) {
            audioFiles.push(file)
          }
        }
      }

      if (audioFiles.length > 0) {
        store.addFiles(audioFiles)
      } else if (e.clipboardData?.files?.length > 0) {
        toastStore.warning(t('uploader.noPasteFiles'))
      }
    } catch {
      toastStore.error(t('uploader.errorPaste'))
    }
  }

  onMounted(() => {
    window.addEventListener('paste', handlePaste)
  })

  onUnmounted(() => {
    window.removeEventListener('paste', handlePaste)
  })
</script>

<template>
  <div
    :class="[
      'rounded-lg border border-dashed p-8 text-center transition-colors sm:p-14',
      isDragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-1',
    ]"
    @drop.prevent="onDrop"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
  >
    <!-- Upload-Icon -->
    <div
      :class="[
        'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg transition-colors',
        isDragging ? 'bg-accent-soft text-ink' : 'bg-surface-2 text-ink-2',
      ]"
    >
      <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
    </div>

    <p class="text-lg font-semibold text-ink">
      {{ t('uploader.dropText') }}
    </p>
    <p class="mt-1.5 text-md text-ink-2">{{ t('uploader.orText') }}</p>

    <div class="mt-4 flex flex-wrap justify-center gap-3">
      <!-- Einzelne Dateien auswählen (Primäraktion) -->
      <label
        class="inline-flex h-control-md cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-md font-semibold text-on-accent transition-colors hover:bg-accent-hover"
      >
        <svg
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span>{{ t('uploader.selectButton') }}</span>
        <input
          type="file"
          multiple
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          class="sr-only"
          @change="onFileSelect"
        />
      </label>

      <!-- Ordner auswählen (Sekundär) -->
      <label
        class="inline-flex h-control-md cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-4 text-md font-medium text-ink transition-colors hover:bg-surface-3"
      >
        <svg
          class="h-4 w-4 text-ink-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
        <span>{{ t('uploader.selectFolderButton') }}</span>
        <input type="file" webkitdirectory multiple class="sr-only" @change="onFolderSelect" />
      </label>
    </div>

    <!-- Paste-Hinweis -->
    <div class="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-3">
      <kbd
        class="inline-flex items-center rounded-sm border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono leading-tight text-ink-2"
        >Strg</kbd
      >
      <span>+</span>
      <kbd
        class="inline-flex items-center rounded-sm border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono leading-tight text-ink-2"
        >V</kbd
      >
      <span class="ml-0.5">{{ t('uploader.pasteHint') }}</span>
    </div>
  </div>
</template>
