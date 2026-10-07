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
    class="sticky-player fixed bottom-0 left-0 right-0 z-player border-t border-line bg-surface-1 shadow-overlay"
  >
    <div class="mx-auto max-w-4xl px-3 py-2.5 sm:px-4 sm:py-3">
      <div class="flex items-center gap-3 sm:gap-4">
        <!-- Transport-Buttons -->
        <div class="flex flex-shrink-0 items-center gap-1 sm:gap-1.5">
          <!-- Previous -->
          <button
            type="button"
            :disabled="!hasPrev"
            :title="t('player.previous')"
            :aria-label="t('player.previous')"
            class="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            @click="player.previous()"
          >
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          <!-- Play/Pause: einzige Goldfläche des Players -->
          <button
            type="button"
            :disabled="converter.files.length === 0"
            :title="player.isPlaying ? t('preview.pause') : t('preview.play')"
            :aria-label="player.isPlaying ? t('preview.pause') : t('preview.play')"
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
            @click="player.togglePlayPause()"
          >
            <svg
              v-if="player.isPlaying"
              class="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
            <svg
              v-else
              class="ml-0.5 h-5 w-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>

          <!-- Next -->
          <button
            type="button"
            :disabled="!hasNext"
            :title="t('player.next')"
            :aria-label="t('player.next')"
            class="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            @click="player.next()"
          >
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
            </svg>
          </button>
        </div>

        <!-- Track-Info + Seek -->
        <div class="min-w-0 flex-1">
          <div class="mb-1 flex items-center justify-between gap-2">
            <p
              :class="[
                'truncate text-md font-medium',
                player.currentTrack ? 'text-ink' : 'italic text-ink-2',
              ]"
            >
              <span v-if="trackPosition" class="mr-1.5 font-mono tabular-nums text-ink-3">{{
                trackPosition
              }}</span
              >{{ trackLabel }}
            </p>
            <span class="flex-shrink-0 font-mono text-xs tabular-nums text-ink-2">
              {{ formatTime(player.progress) }} / {{ formatTime(player.duration) }}
            </span>
          </div>

          <!-- Seek-Slider (Styling global in style.css) -->
          <input
            type="range"
            min="0"
            :max="player.duration || 0"
            step="0.1"
            :value="player.progress"
            :disabled="!player.hasTrack || player.duration === 0"
            :title="t('player.seek')"
            :aria-label="t('player.seek')"
            class="w-full"
            @input="onSeek"
          />
        </div>

        <!-- Lautstärke (Desktop) -->
        <div class="hidden w-28 flex-shrink-0 items-center gap-1.5 sm:flex">
          <svg
            class="h-4 w-4 flex-shrink-0 text-ink-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
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
            :aria-label="t('preview.volume')"
            class="flex-1"
            @input="onVolume"
          />
        </div>
      </div>
    </div>
  </div>
</template>
