<script setup>
import { ref } from 'vue'
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()
const isDragging = ref(false)

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer.files
  store.addFiles(files)
}

function onFileSelect(e) {
  store.addFiles(e.target.files)
}
</script>

<template>
  <div
    @drop.prevent="onDrop"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    :class="[
      'border-2 border-dashed rounded-lg p-12 text-center transition',
      isDragging
        ? 'border-accent bg-accent/10 dark:bg-accent/5'
        : 'border-neutral dark:border-muted bg-white dark:bg-dark-card'
    ]"
  >
    <svg class="mx-auto h-12 w-12 text-muted dark:text-neutral" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
    <p class="mt-2 text-sm text-muted dark:text-neutral">{{ t('uploader.dropText') }}</p>
    <p class="text-xs text-muted-light dark:text-neutral-dark mt-1">{{ t('uploader.orText') }}</p>
    <label class="mt-3 inline-flex items-center gap-2 cursor-pointer bg-accent dark:bg-accent px-4 py-2 rounded-lg hover:bg-accent-dark dark:hover:bg-accent-dark transition-colors shadow-sm hover:shadow-md">
      <svg class="w-5 h-5 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      <span class="text-sm font-medium text-dark">{{ t('uploader.selectButton') }}</span>
      <input type="file" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" @change="onFileSelect" class="hidden" />
    </label>
  </div>
</template>
