<script setup>
import { computed } from 'vue'
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()

function formatSize(bytes) {
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + ' GB'
  }
  return mb.toFixed(2) + ' MB'
}

const maxSizeFormatted = computed(() => formatSize(store.maxPlaylistSize))
const currentSizeFormatted = computed(() => formatSize(store.totalSize))
const overByFormatted = computed(() => formatSize(store.totalSize - store.maxPlaylistSize))
</script>

<template>
  <!-- Red Warning - Over Size Limit -->
  <div
    v-if="store.isOverSizeLimit && store.files.length > 0"
    class="bg-red-50 dark:bg-red-900/30 border-2 border-red-500 dark:border-red-700 rounded-lg p-4 mb-4"
  >
    <div class="flex items-start gap-3">
      <!-- Warning Icon -->
      <svg class="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>

      <div class="flex-1">
        <h3 class="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
          {{ t('sizeWarning.title') }}
        </h3>
        <p class="text-red-700 dark:text-red-400 mb-3">
          {{ t('sizeWarning.message', { maxSize: maxSizeFormatted }) }}
        </p>

        <!-- Size Details -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div class="bg-red-100 dark:bg-red-900/50 rounded px-3 py-2">
            <div class="text-red-600 dark:text-red-400 font-medium">{{ t('sizeWarning.currentSize') }}</div>
            <div class="text-red-800 dark:text-red-300 font-bold">{{ currentSizeFormatted }}</div>
          </div>
          <div class="bg-red-100 dark:bg-red-900/50 rounded px-3 py-2">
            <div class="text-red-600 dark:text-red-400 font-medium">{{ t('sizeWarning.maxSize') }}</div>
            <div class="text-red-800 dark:text-red-300 font-bold">{{ maxSizeFormatted }}</div>
          </div>
          <div class="bg-red-100 dark:bg-red-900/50 rounded px-3 py-2">
            <div class="text-red-600 dark:text-red-400 font-medium">{{ t('sizeWarning.overBy') }}</div>
            <div class="text-red-800 dark:text-red-300 font-bold">{{ overByFormatted }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Green All Clear - Within Limit -->
  <div
    v-else-if="!store.isOverSizeLimit && store.files.length > 0"
    class="bg-green-50 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-700 rounded-lg p-4 mb-4"
  >
    <div class="flex items-start gap-3">
      <!-- Check Icon -->
      <svg class="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>

      <div class="flex-1">
        <h3 class="text-lg font-semibold text-green-800 dark:text-green-300 mb-2">
          {{ t('sizeOk.title') }}
        </h3>
        <p class="text-green-700 dark:text-green-400 mb-3">
          {{ t('sizeOk.message') }}
        </p>

        <!-- Size Details -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div class="bg-green-100 dark:bg-green-900/50 rounded px-3 py-2">
            <div class="text-green-600 dark:text-green-400 font-medium">{{ t('sizeWarning.currentSize') }}</div>
            <div class="text-green-800 dark:text-green-300 font-bold">{{ currentSizeFormatted }}</div>
          </div>
          <div class="bg-green-100 dark:bg-green-900/50 rounded px-3 py-2">
            <div class="text-green-600 dark:text-green-400 font-medium">{{ t('sizeWarning.maxSize') }}</div>
            <div class="text-green-800 dark:text-green-300 font-bold">{{ maxSizeFormatted }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
