<script setup>
  import { computed } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import { useConverterStore } from '../stores/converter'
  import { useI18n } from 'vue-i18n'
  import { formatTime } from '../utils/format'

  const player = usePlayerStore()
  const converter = useConverterStore()
  const { t } = useI18n()

  const hasPrev = computed(() => player.currentIndex > 0)
  const hasNext = computed(
    () => player.currentIndex !== -1 && player.currentIndex < converter.files.length - 1,
  )

  const trackLabel = computed(() => {
    if (player.currentTrack) return player.currentTrack.name
    return t('player.noTrack')
  })

  const trackPosition = computed(() => {
    if (player.currentIndex === -1) return null
    return `${player.currentIndex + 1} / ${converter.files.length}`
  })

  function onSeek(e) {
    player.seek(parseFloat(e.target.value))
  }

  function onVolume(e) {
    player.setVolume(parseFloat(e.target.value))
  }
</script>

<template>
  <div
    class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-dark-card/95 backdrop-blur border-t border-neutral dark:border-muted shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
  >
    <div class="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
      <div class="flex items-center gap-3 sm:gap-4">
        <!-- Transport-Buttons -->
        <div class="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <!-- Previous -->
          <button
            :disabled="!hasPrev"
            :title="t('player.previous')"
            class="w-8 h-8 flex items-center justify-center rounded-full text-dark dark:text-neutral-light hover:bg-neutral dark:hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            @click="player.previous()"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          <!-- Play/Pause -->
          <button
            :disabled="converter.files.length === 0"
            :title="player.isPlaying ? t('preview.pause') : t('preview.play')"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-dark hover:bg-accent-dark transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="player.togglePlayPause()"
          >
            <svg v-if="player.isPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
            <svg v-else class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>

          <!-- Next -->
          <button
            :disabled="!hasNext"
            :title="t('player.next')"
            class="w-8 h-8 flex items-center justify-center rounded-full text-dark dark:text-neutral-light hover:bg-neutral dark:hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            @click="player.next()"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
            </svg>
          </button>
        </div>

        <!-- Track-Info + Seek -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <p
              class="text-sm font-medium text-dark dark:text-neutral-light truncate"
              :class="{ 'text-muted dark:text-neutral italic': !player.currentTrack }"
            >
              <span v-if="trackPosition" class="text-muted dark:text-neutral font-mono mr-1.5"
                >{{ trackPosition }}</span
              >{{ trackLabel }}
            </p>
            <span
              class="text-xs text-muted dark:text-neutral font-mono flex-shrink-0 tabular-nums"
            >
              {{ formatTime(player.progress) }} / {{ formatTime(player.duration) }}
            </span>
          </div>

          <!-- Seek-Slider -->
          <input
            type="range"
            min="0"
            :max="player.duration || 0"
            step="0.1"
            :value="player.progress"
            :disabled="!player.hasTrack || player.duration === 0"
            :title="t('player.seek')"
            class="player-slider w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
            @input="onSeek"
          />
        </div>

        <!-- Lautstärke (Desktop) -->
        <div class="hidden sm:flex items-center gap-1.5 flex-shrink-0 w-28">
          <svg
            class="w-4 h-4 text-muted dark:text-neutral flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              v-if="player.volume > 0.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z"
            />
            <path
              v-else-if="player.volume > 0"
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
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="player.volume"
            :title="`${t('preview.volume')}: ${Math.round(player.volume * 100)}% — ${t('preview.volumeHint')}`"
            class="player-slider flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
            @input="onVolume"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* Slider-Styling (Seek + Volume) */
  .player-slider {
    -webkit-appearance: none;
    appearance: none;
    background: #c0c2c9;
  }

  .dark .player-slider {
    background: #1e3a5f;
  }

  .player-slider:disabled {
    opacity: 0.5;
  }

  .player-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #c9984d;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .player-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .player-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #c9984d;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: transform 0.15s ease;
  }

  .player-slider::-moz-range-thumb:hover {
    transform: scale(1.15);
  }
</style>
