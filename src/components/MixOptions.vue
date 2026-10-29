<script setup lang="ts">
  import { computed, useId } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore } from '../stores/converter'
  import { MAX_TRANSITION_SECONDS, MIN_TRANSITION_SECONDS, type TransitionType } from '../constants'

  /**
   * Pause oder Crossfade zwischen den Tracks (N4), Lautheitsangleichung (N5)
   * und Stille am Rand entfernen (N9). Alles erzwingt auf dem Server die
   * Neukodierung, ebenso zugeschnittene Tracks.
   */
  const store = useConverterStore()
  const { t, locale } = useI18n()
  const uid = useId()

  const TRANSITION_OPTIONS: readonly { value: TransitionType; labelKey: string }[] = [
    { value: 'none', labelKey: 'mix.none' },
    { value: 'gap', labelKey: 'mix.gap' },
    { value: 'crossfade', labelKey: 'mix.crossfade' },
  ]

  const transition = computed({
    get: () => store.transition,
    set: (value: TransitionType) => store.setTransition(value),
  })
  const seconds = computed({
    get: () => store.transitionSeconds,
    set: (value: number) => store.setTransitionSeconds(Number(value)),
  })
  const loudnorm = computed({
    get: () => store.loudnorm,
    set: (value: boolean) => store.setLoudnorm(value),
  })
  const trimSilence = computed({
    get: () => store.trimSilence,
    set: (value: boolean) => store.setTrimSilence(value),
  })

  const reencode = computed(
    () =>
      store.transition !== 'none' ||
      store.loudnorm ||
      store.trimSilence ||
      store.files.some((f) => f.trimStart !== undefined || f.trimEnd !== undefined),
  )
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
    <h2 class="mb-3 text-md font-semibold text-ink">{{ t('mix.title') }}</h2>

    <fieldset>
      <legend class="mb-2 text-sm font-medium text-ink-2">{{ t('mix.transition') }}</legend>
      <div class="grid grid-cols-3 gap-2">
        <label
          v-for="option in TRANSITION_OPTIONS"
          :key="option.value"
          :class="[
            'cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
            transition === option.value
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3',
          ]"
        >
          <input
            v-model="transition"
            type="radio"
            :name="`transition-${uid}`"
            :value="option.value"
            :data-transition="option.value"
            class="sr-only"
          />
          {{ t(option.labelKey) }}
        </label>
      </div>
    </fieldset>

    <div v-if="transition !== 'none'" class="mt-3 flex items-center gap-3">
      <label :for="`transition-seconds-${uid}`" class="shrink-0 text-sm text-ink-2">
        {{ t('mix.seconds') }}
      </label>
      <input
        :id="`transition-seconds-${uid}`"
        v-model.number="seconds"
        type="range"
        :min="MIN_TRANSITION_SECONDS"
        :max="MAX_TRANSITION_SECONDS"
        step="0.5"
        data-testid="transition-seconds"
        class="w-full accent-accent"
      />
      <span class="w-12 shrink-0 text-right text-sm tabular-nums text-ink" aria-hidden="true">
        {{ t('mix.secondsValue', { n: seconds.toLocaleString(locale) }) }}
      </span>
    </div>

    <label class="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
      <input
        v-model="loudnorm"
        type="checkbox"
        data-testid="loudnorm"
        class="mt-0.5 h-4 w-4 accent-accent"
      />
      <span>
        {{ t('mix.loudnorm') }}
        <span class="block text-xs text-ink-3">{{ t('mix.loudnormHint') }}</span>
      </span>
    </label>

    <label class="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
      <input
        v-model="trimSilence"
        type="checkbox"
        data-testid="trim-silence"
        class="mt-0.5 h-4 w-4 accent-accent"
      />
      <span>
        {{ t('mix.trimSilence') }}
        <span class="block text-xs text-ink-3">{{ t('mix.trimSilenceHint') }}</span>
      </span>
    </label>

    <p v-if="reencode" class="mt-3 text-xs text-ink-3" data-testid="reencode-hint">
      {{ t('mix.reencodeHint') }}
    </p>
  </section>
</template>
