<script setup>
import { ref, onUnmounted } from 'vue'
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()

let draggedIndex = null

// Audio Preview State
const currentlyPlaying = ref(null) // ID des aktuell spielenden Tracks
const audioElement = ref(null)
const audioProgress = ref(0)
const audioDuration = ref(0)
const audioVolume = ref(0.7) // Lautstärke (0-1), Standard 70%
const audioObjectUrls = new Map() // Cache für Object URLs

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

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getAudioUrl(item) {
  if (!audioObjectUrls.has(item.id)) {
    audioObjectUrls.set(item.id, URL.createObjectURL(item.file))
  }
  return audioObjectUrls.get(item.id)
}

function togglePlay(item) {
  if (currentlyPlaying.value === item.id) {
    // Pause aktuellen Track
    if (audioElement.value) {
      audioElement.value.pause()
    }
    currentlyPlaying.value = null
    audioProgress.value = 0
  } else {
    // Stoppe vorherigen Track falls vorhanden
    if (audioElement.value) {
      audioElement.value.pause()
    }

    // Spiele neuen Track
    currentlyPlaying.value = item.id
    audioProgress.value = 0
    audioDuration.value = 0

    const url = getAudioUrl(item)
    audioElement.value = new Audio(url)

    audioElement.value.addEventListener('timeupdate', () => {
      if (audioElement.value) {
        audioProgress.value = audioElement.value.currentTime
      }
    })

    audioElement.value.addEventListener('loadedmetadata', () => {
      if (audioElement.value) {
        audioDuration.value = audioElement.value.duration
      }
    })

    audioElement.value.addEventListener('ended', () => {
      currentlyPlaying.value = null
      audioProgress.value = 0
    })

    // Setze Lautstärke
    audioElement.value.volume = audioVolume.value

    audioElement.value.play()
  }
}

function stopPlayback() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value = null
  }
  currentlyPlaying.value = null
  audioProgress.value = 0
}

function setVolume(value) {
  audioVolume.value = value
  if (audioElement.value) {
    audioElement.value.volume = value
  }
}

function handleRemoveFile(id) {
  // Stoppe Wiedergabe falls dieser Track spielt
  if (currentlyPlaying.value === id) {
    stopPlayback()
  }
  // Bereinige Object URL
  if (audioObjectUrls.has(id)) {
    URL.revokeObjectURL(audioObjectUrls.get(id))
    audioObjectUrls.delete(id)
  }
  store.removeFile(id)
}

function handleRemoveAll() {
  stopPlayback()
  // Bereinige alle Object URLs
  audioObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  audioObjectUrls.clear()
  store.removeAllFiles()
}

// Cleanup beim Verlassen der Komponente
onUnmounted(() => {
  stopPlayback()
  audioObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  audioObjectUrls.clear()
})
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-4">
    <div class="flex justify-between items-center mb-3">
      <div>
        <h3 class="font-semibold text-dark dark:text-neutral-light">{{ t('fileList.title') }} ({{ store.files.length }} {{ t('fileList.tracks') }})</h3>
        <p class="text-sm text-muted dark:text-neutral mt-1">{{ t('fileList.totalSize') }}: {{ formatTotalSize(store.totalSize) }}</p>
      </div>
      <button @click="handleRemoveAll" class="text-sm text-secondary dark:text-secondary-light hover:underline">{{ t('fileList.removeAll') }}</button>
    </div>

    <div class="space-y-2 max-h-[420px] overflow-y-auto">
      <div
        v-for="(item, index) in store.files"
        :key="item.id"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
        :class="[
          'flex items-center gap-3 p-3 rounded border cursor-move transition-colors',
          currentlyPlaying === item.id
            ? 'bg-accent/10 dark:bg-accent/20 border-accent dark:border-accent'
            : 'bg-neutral-light dark:bg-dark-lighter border-neutral dark:border-muted hover:bg-neutral/30 dark:hover:bg-muted/30'
        ]"
      >
        <!-- Track Nummer -->
        <span class="text-muted dark:text-neutral font-mono text-sm w-8">{{ index + 1 }}.</span>

        <!-- Play/Pause Button -->
        <button
          @click.stop="togglePlay(item)"
          :title="currentlyPlaying === item.id ? t('preview.pause') : t('preview.play')"
          :class="[
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0',
            currentlyPlaying === item.id
              ? 'bg-accent text-dark hover:bg-accent-dark'
              : 'bg-neutral dark:bg-muted text-dark dark:text-neutral-light hover:bg-accent hover:text-dark'
          ]"
        >
          <!-- Pause Icon -->
          <svg v-if="currentlyPlaying === item.id" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
          </svg>
          <!-- Play Icon -->
          <svg v-else class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>

        <!-- Volume Slider (nur sichtbar wenn dieser Track spielt) -->
        <div
          v-if="currentlyPlaying === item.id"
          class="flex items-center gap-1.5 flex-shrink-0"
          @click.stop
          @mousedown.stop
          @dragstart.stop.prevent
          draggable="false"
        >
          <!-- Volume Icon -->
          <svg
            class="w-4 h-4 text-muted dark:text-neutral flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              v-if="audioVolume > 0.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z"
            />
            <path
              v-else-if="audioVolume > 0"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072M11 5L6 9H2v6h4l5 4V5z"
            />
            <path
              v-else
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
            />
          </svg>
          <!-- Volume Slider -->
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="audioVolume"
            @input="setVolume(parseFloat($event.target.value))"
            :title="`${t('preview.volume')}: ${Math.round(audioVolume * 100)}% — ${t('preview.volumeHint')}`"
            class="volume-slider w-16 h-1.5 bg-neutral dark:bg-muted rounded-full appearance-none cursor-pointer accent-accent"
          />
        </div>

        <!-- Track Info -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-dark dark:text-neutral-light truncate">{{ item.name }}</p>
          <div class="flex items-center gap-2">
            <p class="text-xs text-muted dark:text-neutral">{{ formatSize(item.size) }}</p>
            <!-- Progress während Wiedergabe -->
            <template v-if="currentlyPlaying === item.id && audioDuration > 0">
              <span class="text-xs text-accent">
                {{ formatTime(audioProgress) }} / {{ formatTime(audioDuration) }}
              </span>
            </template>
          </div>
          <!-- Progress Bar während Wiedergabe -->
          <div v-if="currentlyPlaying === item.id && audioDuration > 0" class="mt-1.5 h-1 bg-neutral dark:bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-accent transition-all duration-200"
              :style="{ width: `${(audioProgress / audioDuration) * 100}%` }"
            ></div>
          </div>
        </div>

        <!-- Remove Button -->
        <button @click="handleRemoveFile(item.id)" class="text-secondary dark:text-secondary-light hover:text-secondary-dark dark:hover:text-secondary flex-shrink-0">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Volume Slider Styling */
.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}

.volume-slider::-webkit-slider-runnable-track {
  width: 100%;
  height: 6px;
  background: #AEAFB7;
  border-radius: 3px;
}

.dark .volume-slider::-webkit-slider-runnable-track {
  background: #5E5F69;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #F2E28E;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -4px;
  transition: transform 0.15s ease;
}

.volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.volume-slider::-moz-range-track {
  width: 100%;
  height: 6px;
  background: #AEAFB7;
  border-radius: 3px;
}

.dark .volume-slider::-moz-range-track {
  background: #5E5F69;
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #F2E28E;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease;
}

.volume-slider::-moz-range-thumb:hover {
  transform: scale(1.15);
}
</style>
