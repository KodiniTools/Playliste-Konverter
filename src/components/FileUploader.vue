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
    @drop.prevent="onDrop"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    :class="[
      'border-2 border-dashed rounded-2xl p-8 sm:p-14 text-center transition-all duration-200',
      isDragging
        ? 'border-accent bg-accent/10 dark:bg-accent/5 scale-[1.01]'
        : 'border-neutral dark:border-muted bg-white dark:bg-dark-card hover:border-accent/40 dark:hover:border-accent/30',
    ]"
  >
    <!-- Upload-Icon -->
    <div
      :class="[
        'mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors duration-200',
        isDragging ? 'bg-accent/20' : 'bg-neutral-light dark:bg-dark-lighter',
      ]"
    >
      <svg
        :class="['w-8 h-8 transition-colors duration-200', isDragging ? 'text-accent' : 'text-muted dark:text-neutral']"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
    </div>

    <p class="text-base sm:text-lg font-semibold text-dark dark:text-neutral-light">
      {{ t('uploader.dropText') }}
    </p>
    <p class="text-sm text-muted dark:text-neutral mt-1.5">{{ t('uploader.orText') }}</p>

    <div class="mt-4 flex flex-wrap justify-center gap-3">
      <!-- Einzelne Dateien auswählen -->
      <label
        class="inline-flex items-center gap-2 cursor-pointer bg-accent px-5 py-2.5 rounded-xl hover:bg-accent-dark transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
      >
        <svg class="w-4 h-4 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span class="text-sm font-semibold text-dark">{{ t('uploader.selectButton') }}</span>
        <input
          type="file"
          multiple
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          @change="onFileSelect"
          class="hidden"
        />
      </label>

      <!-- Ordner auswählen -->
      <label
        class="inline-flex items-center gap-2 cursor-pointer bg-white dark:bg-dark-lighter border-2 border-neutral dark:border-muted px-5 py-2.5 rounded-xl hover:border-accent dark:hover:border-accent transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
      >
        <svg
          class="w-4 h-4 text-muted dark:text-neutral"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
        <span class="text-sm font-semibold text-muted dark:text-neutral">{{
          t('uploader.selectFolderButton')
        }}</span>
        <input type="file" webkitdirectory multiple @change="onFolderSelect" class="hidden" />
      </label>
    </div>

    <!-- Paste-Hinweis -->
    <div class="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted dark:text-neutral">
      <kbd
        class="inline-flex items-center px-1.5 py-0.5 rounded border border-neutral dark:border-muted font-mono bg-neutral-light dark:bg-dark-lighter text-muted dark:text-neutral leading-tight"
        >Strg</kbd
      >
      <span class="text-muted-light dark:text-neutral-dark">+</span>
      <kbd
        class="inline-flex items-center px-1.5 py-0.5 rounded border border-neutral dark:border-muted font-mono bg-neutral-light dark:bg-dark-lighter text-muted dark:text-neutral leading-tight"
        >V</kbd
      >
      <span class="ml-0.5 text-muted-light dark:text-neutral-dark">{{
        t('uploader.pasteHint')
      }}</span>
    </div>
  </div>
</template>
