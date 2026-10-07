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
  <section class="rounded-lg border border-line bg-surface-1 p-3 sm:p-4">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-md font-semibold text-ink sm:text-lg">
          {{ t('fileList.title') }} ({{ store.files.length }} {{ t('fileList.tracks') }})
        </h3>
        <p class="mt-1 text-sm tabular-nums text-ink-2">
          {{ t('fileList.totalSize') }}: {{ formatBytes(store.totalSize) }}
        </p>
      </div>
      <button
        type="button"
        class="flex-shrink-0 rounded-sm px-2 text-sm font-medium text-danger transition-colors hover:underline"
        @click="handleRemoveAll"
      >
        {{ t('fileList.removeAll') }}
      </button>
    </div>

    <div class="max-h-[420px] space-y-2 overflow-y-auto">
      <div
        v-for="(item, index) in store.files"
        :key="item.id"
        draggable="true"
        :class="[
          'flex min-h-row cursor-move items-center gap-2 rounded-sm border p-2 transition-colors sm:gap-3 sm:p-3',
          isActive(item)
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-surface-2 hover:bg-surface-3',
        ]"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
      >
        <!-- Track Nummer -->
        <span class="hidden w-6 font-mono text-sm tabular-nums text-ink-3 sm:inline sm:w-8"
          >{{ index + 1 }}.</span
        >

        <!-- Play/Pause Button (Auswahl für den Sticky-Player) -->
        <button
          type="button"
          :title="isActive(item) && player.isPlaying ? t('preview.pause') : t('preview.play')"
          :aria-label="isActive(item) && player.isPlaying ? t('preview.pause') : t('preview.play')"
          :class="[
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
            isActive(item)
              ? 'bg-accent text-on-accent hover:bg-accent-hover'
              : 'border border-line-strong bg-surface-1 text-ink hover:bg-surface-3',
          ]"
          @click.stop="player.toggle(item)"
        >
          <!-- Pause Icon (nur wenn dieser Track aktiv spielt) -->
          <svg
            v-if="isActive(item) && player.isPlaying"
            class="h-4 w-4"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
          <!-- Play Icon -->
          <svg
            v-else
            class="ml-0.5 h-4 w-4"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <!-- Track Info -->
        <div class="min-w-0 flex-1">
          <p class="truncate text-md font-medium text-ink">
            {{ item.name }}
          </p>
          <p class="text-xs tabular-nums text-ink-2">{{ formatBytes(item.size) }}</p>
        </div>

        <!-- Remove Button -->
        <button
          type="button"
          :title="t('fileList.remove')"
          :aria-label="`${t('fileList.remove')}: ${item.name}`"
          class="flex h-control-sm w-7 flex-shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-3 hover:text-danger"
          @click.stop="handleRemoveFile(item.id)"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>
