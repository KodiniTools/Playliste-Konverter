<script setup>
  import { useConverterStore } from '../stores/converter'
  import { usePlayerStore } from '../stores/player'
  import { useI18n } from 'vue-i18n'
  import { formatBytes } from '../utils/format'

  const store = useConverterStore()
  const player = usePlayerStore()
  const { t } = useI18n()

  let draggedIndex = null

  function onDragStart(e, index) {
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

  function isActive(item) {
    return player.currentId === item.id
  }

  function handleRemoveFile(id) {
    // Wiedergabe/URL-Cleanup übernimmt der Player-Store per Watcher
    store.removeFile(id)
  }

  function handleRemoveAll() {
    store.removeAllFiles()
  }
</script>

<template>
  <div
    class="bg-white dark:bg-dark-card rounded-2xl border border-neutral dark:border-muted p-3 sm:p-4 shadow-sm"
  >
    <div class="flex justify-between items-center mb-3 gap-2">
      <div class="min-w-0">
        <h3 class="font-semibold text-dark dark:text-neutral-light text-sm sm:text-base">
          {{ t('fileList.title') }} ({{ store.files.length }} {{ t('fileList.tracks') }})
        </h3>
        <p class="text-xs sm:text-sm text-muted dark:text-neutral mt-1">
          {{ t('fileList.totalSize') }}: {{ formatBytes(store.totalSize) }}
        </p>
      </div>
      <button
        class="text-xs sm:text-sm text-secondary dark:text-secondary-light hover:underline flex-shrink-0"
        @click="handleRemoveAll"
      >
        {{ t('fileList.removeAll') }}
      </button>
    </div>

    <div class="space-y-2 max-h-[420px] overflow-y-auto">
      <div
        v-for="(item, index) in store.files"
        :key="item.id"
        draggable="true"
        :class="[
          'flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded border cursor-move transition-colors',
          isActive(item)
            ? 'bg-accent/10 dark:bg-accent/20 border-accent dark:border-accent'
            : 'bg-neutral-light dark:bg-dark-lighter border-neutral dark:border-muted hover:bg-neutral/30 dark:hover:bg-muted/30',
        ]"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
      >
        <!-- Track Nummer -->
        <span class="text-muted dark:text-neutral font-mono text-sm w-6 sm:w-8 hidden sm:inline"
          >{{ index + 1 }}.</span
        >

        <!-- Play/Pause Button (Auswahl für den Sticky-Player) -->
        <button
          :title="isActive(item) && player.isPlaying ? t('preview.pause') : t('preview.play')"
          :class="[
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0',
            isActive(item)
              ? 'bg-accent text-dark hover:bg-accent-dark'
              : 'bg-neutral dark:bg-muted text-dark dark:text-neutral-light hover:bg-accent hover:text-dark',
          ]"
          @click.stop="player.toggle(item)"
        >
          <!-- Pause Icon (nur wenn dieser Track aktiv spielt) -->
          <svg
            v-if="isActive(item) && player.isPlaying"
            class="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
          <!-- Play Icon -->
          <svg v-else class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <!-- Track Info -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-dark dark:text-neutral-light truncate">
            {{ item.name }}
          </p>
          <p class="text-xs text-muted dark:text-neutral">{{ formatBytes(item.size) }}</p>
        </div>

        <!-- Remove Button -->
        <button
          class="text-secondary dark:text-secondary-light hover:text-secondary-dark dark:hover:text-secondary flex-shrink-0"
          @click.stop="handleRemoveFile(item.id)"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
