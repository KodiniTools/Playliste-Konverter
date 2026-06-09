<script setup>
  import { ref } from 'vue'
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
</script>

<template>
  <div
    @drop.prevent="onDrop"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    :class="[
      'border-2 border-dashed rounded-lg p-6 sm:p-12 text-center transition',
      isDragging
        ? 'border-accent bg-accent/10 dark:bg-accent/5'
        : 'border-neutral dark:border-muted bg-white dark:bg-dark-card',
    ]"
  >
    <svg
      class="mx-auto h-12 w-12 text-muted dark:text-neutral"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
    <p class="mt-2 text-sm text-muted dark:text-neutral">{{ t('uploader.dropText') }}</p>
    <p class="text-xs text-muted-light dark:text-neutral-dark mt-1">{{ t('uploader.orText') }}</p>

    <div class="mt-3 flex flex-wrap justify-center gap-3">
      <!-- Einzelne Dateien auswählen -->
      <label
        class="inline-flex items-center gap-2 cursor-pointer bg-accent dark:bg-accent px-4 py-2 rounded-lg hover:bg-accent-dark dark:hover:bg-accent-dark transition-colors shadow-sm hover:shadow-md"
      >
        <svg class="w-5 h-5 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span class="text-sm font-medium text-dark">{{ t('uploader.selectButton') }}</span>
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
        class="inline-flex items-center gap-2 cursor-pointer bg-accent dark:bg-accent px-4 py-2 rounded-lg hover:bg-accent-dark dark:hover:bg-accent-dark transition-colors shadow-sm hover:shadow-md"
      >
        <svg class="w-5 h-5 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
        <span class="text-sm font-medium text-dark">{{ t('uploader.selectFolderButton') }}</span>
        <input type="file" webkitdirectory multiple @change="onFolderSelect" class="hidden" />
      </label>
    </div>
  </div>
</template>
