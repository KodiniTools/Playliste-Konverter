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
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
    ]"
  >
    <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
    <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{{ t('uploader.dropText') }}</p>
    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">{{ t('uploader.orText') }}</p>
    <label class="mt-2 inline-block cursor-pointer bg-white dark:bg-gray-700 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('uploader.selectButton') }}</span>
      <input type="file" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" @change="onFileSelect" class="hidden" />
    </label>
  </div>
</template>
