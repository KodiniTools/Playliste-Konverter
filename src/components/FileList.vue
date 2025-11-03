<script setup>
import { useConverterStore } from '../stores/converter'

const store = useConverterStore()

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
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-4">
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-semibold text-gray-900">Playlist ({{ store.files.length }} Tracks)</h3>
      <button @click="store.reset" class="text-sm text-red-600 hover:underline">Alle entfernen</button>
    </div>
    
    <div class="space-y-2 max-h-[420px] overflow-y-auto">
      <div
        v-for="(item, index) in store.files"
        :key="item.id"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
        class="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200 cursor-move hover:bg-gray-100"
      >
        <span class="text-gray-400 font-mono text-sm w-8">{{ index + 1 }}.</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 truncate">{{ item.name }}</p>
          <p class="text-xs text-gray-500">{{ formatSize(item.size) }}</p>
        </div>
        <button @click="store.removeFile(item.id)" class="text-red-600 hover:text-red-800">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
