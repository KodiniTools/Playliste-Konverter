<script setup lang="ts">
  import { useConverterStore, type PlaylistItem } from '../stores/converter'
  import { usePlayerStore } from '../stores/player'
  import { nextTick, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { formatBytes, formatDuration, formatTime, formatTrimTime } from '../utils/format'
  import { SORT_MODES, type SortMode } from '../utils/playlistOrder'
  import TrimEditor from './TrimEditor.vue'

  const store = useConverterStore()
  const player = usePlayerStore()
  const { t } = useI18n()

  let draggedIndex: number | null = null

  function onDragStart(_e: DragEvent, index: number) {
    draggedIndex = index
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      store.moveFile(draggedIndex, index)
      draggedIndex = index
    }
  }

  function onDragEnd() {
    draggedIndex = null
  }

  // Ansage für Screenreader nach dem Verschieben per Taste/Button
  const moveAnnouncement = ref('')

  /**
   * Track um eine Position verschieben (Buttons und Alt+Pfeiltaste; geht auch
   * ohne Drag & Drop, also per Touch und Tastatur). Der Fokus bleibt auf dem
   * Track; ist die gedrückte Richtung danach gesperrt, wechselt er zur anderen.
   */
  async function moveBy(index: number, delta: -1 | 1, direction: 'up' | 'down') {
    const target = index + delta
    const item = store.files[index]
    if (!item || target < 0 || target >= store.files.length) return
    store.moveFile(index, target)
    moveAnnouncement.value = t('fileList.moved', {
      name: item.name,
      position: target + 1,
      total: store.files.length,
    })
    await nextTick()
    const other = direction === 'up' ? 'down' : 'up'
    const pressed = document.querySelector<HTMLButtonElement>(
      `[data-move="${direction}"][data-track-id="${item.id}"]`,
    )
    const fallback = document.querySelector<HTMLButtonElement>(
      `[data-move="${other}"][data-track-id="${item.id}"]`,
    )
    if (pressed && !pressed.disabled) pressed.focus()
    else fallback?.focus()
  }

  function onRowKeydown(e: KeyboardEvent, index: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    if (e.key === 'ArrowUp') void moveBy(index, -1, 'up')
    else void moveBy(index, 1, 'down')
  }

  // Geöffneter Zuschnitt-Editor (immer nur einer)
  const openTrimId = ref<number | null>(null)

  function toggleTrim(id: number) {
    openTrimId.value = openTrimId.value === id ? null : id
  }

  function isTrimmed(item: PlaylistItem) {
    return item.trimStart !== undefined || item.trimEnd !== undefined
  }

  function trimRange(item: PlaylistItem) {
    const end = item.trimEnd ?? item.duration
    return `${formatTrimTime(item.trimStart ?? 0)}–${typeof end === 'number' ? formatTrimTime(end) : '…'}`
  }

  function isActive(item: PlaylistItem) {
    return player.currentId === item.id
  }

  function handleRemoveFile(id: number) {
    // Wiedergabe/URL-Cleanup übernimmt der Player-Store per Watcher
    store.removeFile(id)
  }

  function handleRemoveAll() {
    store.removeAllFiles()
  }

  const SORT_LABEL_KEYS: Record<SortMode, string> = {
    name: 'fileList.sortName',
    trackNumber: 'fileList.sortTrackNumber',
    reverse: 'fileList.sortReverse',
    shuffle: 'fileList.sortShuffle',
  }

  function handleSort(mode: SortMode) {
    store.sortFiles(mode)
    moveAnnouncement.value = t('fileList.sorted', { mode: t(SORT_LABEL_KEYS[mode]) })
  }

  /** Gesamtdauer: „…“ solange Dauern fehlen, „≥“ wenn eine Datei unlesbar war. */
  function totalDurationText(): string {
    if (store.durationsPending) return t('fileList.durationPending')
    const prefix = store.durationsIncomplete ? '≥ ' : ''
    return prefix + formatDuration(store.totalDuration)
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
          <span aria-hidden="true">·</span>
          {{ t('fileList.totalDuration') }}: {{ totalDurationText() }}
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

    <div
      v-if="store.files.length > 1"
      role="group"
      :aria-label="t('fileList.sort')"
      class="mb-3 flex flex-wrap items-center gap-1 text-sm"
    >
      <span class="mr-1 text-ink-3">{{ t('fileList.sort') }}:</span>
      <button
        v-for="mode in SORT_MODES"
        :key="mode"
        type="button"
        :data-sort="mode"
        class="rounded-sm border border-line bg-surface-2 px-2 py-0.5 font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
        @click="handleSort(mode)"
      >
        {{ t(SORT_LABEL_KEYS[mode]) }}
      </button>
    </div>

    <div class="max-h-[420px] space-y-2 overflow-y-auto">
      <div v-for="(item, index) in store.files" :key="item.id" class="space-y-1">
        <div
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
          @keydown="onRowKeydown($event, index)"
        >
          <!-- Track Nummer -->
          <span class="hidden w-6 font-mono text-sm tabular-nums text-ink-3 sm:inline sm:w-8"
            >{{ index + 1 }}.</span
          >

          <!-- Play/Pause Button (Auswahl für den Sticky-Player) -->
          <button
            type="button"
            :title="isActive(item) && player.isPlaying ? t('preview.pause') : t('preview.play')"
            :aria-label="
              isActive(item) && player.isPlaying ? t('preview.pause') : t('preview.play')
            "
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
            <p class="text-xs tabular-nums text-ink-2">
              {{ formatBytes(item.size) }}
              <template v-if="typeof item.duration === 'number'">
                <span aria-hidden="true">·</span> {{ formatTime(item.duration) }}
              </template>
              <span v-if="isTrimmed(item)" class="ml-1 text-accent" data-testid="trim-badge"
                >· {{ t('trim.badge', { range: trimRange(item) }) }}</span
              >
              <span
                v-if="store.duplicateIds.has(item.id)"
                class="ml-1 font-medium text-warning"
                :title="t('fileList.duplicateHint')"
                >· {{ t('fileList.duplicate') }}</span
              >
            </p>
          </div>

          <!-- Reihenfolge ändern (Touch/Tastatur; Alt+↑/↓ auf dem Track) -->
          <div class="flex flex-shrink-0 items-center">
            <button
              type="button"
              data-move="up"
              :data-track-id="item.id"
              :disabled="index === 0"
              :title="t('fileList.moveUp')"
              :aria-label="`${t('fileList.moveUp')}: ${item.name}`"
              aria-keyshortcuts="Alt+ArrowUp"
              class="flex h-control-sm w-7 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              @click.stop="moveBy(index, -1, 'up')"
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
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
            <button
              type="button"
              data-move="down"
              :data-track-id="item.id"
              :disabled="index === store.files.length - 1"
              :title="t('fileList.moveDown')"
              :aria-label="`${t('fileList.moveDown')}: ${item.name}`"
              aria-keyshortcuts="Alt+ArrowDown"
              class="flex h-control-sm w-7 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              @click.stop="moveBy(index, 1, 'down')"
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
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>

          <!-- Zuschneiden (N9) -->
          <button
            type="button"
            :title="t('trim.toggle')"
            :aria-label="`${t('trim.toggle')}: ${item.name}`"
            :aria-expanded="openTrimId === item.id"
            :data-trim-toggle="item.id"
            :class="[
              'flex h-control-sm w-7 flex-shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-surface-3',
              isTrimmed(item) || openTrimId === item.id
                ? 'text-accent'
                : 'text-ink-3 hover:text-ink',
            ]"
            @click.stop="toggleTrim(item.id)"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="3" stroke-width="2" />
              <circle cx="6" cy="18" r="3" stroke-width="2" />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"
              />
            </svg>
          </button>

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
        <TrimEditor v-if="openTrimId === item.id" :item="item" />
      </div>
    </div>
    <p class="sr-only" aria-live="polite">{{ moveAnnouncement }}</p>
  </section>
</template>
