<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()

let draggedIndex = null

function onDragStart(index) {
  draggedIndex = index
}

function onDragOver(e, index) {
  e.preventDefault()
  if (draggedIndex !== null && draggedIndex !== index) {
    store.moveFile(draggedIndex, index)
    draggedIndex = index
  }
}

function onDragEnd() {
  draggedIndex = null
}

function formatSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTotalSize(bytes) {
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + ' GB'
  }
  return mb.toFixed(2) + ' MB'
}
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-4">
    <div class="flex justify-between items-center mb-3">
      <div>
        <h3 class="font-semibold text-dark dark:text-neutral-light">{{ t('fileList.title') }} ({{ store.files.length }} {{ t('fileList.tracks') }})</h3>
        <p class="text-sm text-muted dark:text-neutral mt-1">{{ t('fileList.totalSize') }}: {{ formatTotalSize(store.totalSize) }}</p>
      </div>
      <button @click="store.reset" class="text-sm text-secondary dark:text-secondary-light hover:underline">{{ t('fileList.removeAll') }}</button>
    </div>

    <div class="space-y-2 max-h-[420px] overflow-y-auto">
      <div
        v-for="(item, index) in store.files"
        :key="item.id"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
        class="flex items-center gap-3 p-3 bg-neutral-light dark:bg-dark-lighter rounded border border-neutral dark:border-muted cursor-move hover:bg-neutral/30 dark:hover:bg-muted/30 transition-colors"
      >
        <span class="text-muted dark:text-neutral font-mono text-sm w-8">{{ index + 1 }}.</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-dark dark:text-neutral-light truncate">{{ item.name }}</p>
          <p class="text-xs text-muted dark:text-neutral">{{ formatSize(item.size) }}</p>
        </div>
        <button @click="store.removeFile(item.id)" class="text-secondary dark:text-secondary-light hover:text-secondary-dark dark:hover:text-secondary">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
