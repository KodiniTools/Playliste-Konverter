<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore } from '../stores/converter'
  import { useToastStore } from '../stores/toast'
  import { useUIStore } from '../stores/ui'
  import type { ThemeName } from '../design-system/tokens-v2'
  import { logger } from '../utils/logger'
  import { errorName } from '../utils/errors'
  import {
    BACKGROUND_TYPES,
    BackgroundImageError,
    PLAYLIST_IMAGE_SIZES,
    TEXT_OPACITY_MIN,
    TEXT_SCALE_MAX,
    TEXT_SCALE_MIN,
    contrastRatio,
    defaultImageColors,
    formatTotal,
    imageTracks,
    loadBackgroundImage,
    mixColors,
    playlistImageFileName,
    renderPlaylistImage,
    type BackgroundErrorCode,
    type ImageBackground,
    type PlaylistImageData,
    type PlaylistImageFormat,
    type PlaylistImageType,
  } from '../utils/playlistImage'

  /**
   * Die fertige Playlist als Bild (1:1 oder 2:3) speichern oder teilen, mit
   * denselben Einstellungen wie im Playlist Generator: Farbschema, Text- und
   * Hintergrundfarbe, Hintergrundbild mit Deckkraft, dazu Textgröße und
   * Textdeckkraft. Gezeichnet wird erst, wenn der Bereich aufgeklappt ist.
   */
  const store = useConverterStore()
  const ui = useUIStore()
  const toast = useToastStore()
  const { t } = useI18n()
  const uid = useId()
  const id = (name: string) => `img-${name}-${uid}`

  const open = ref(false)
  const format = ref<PlaylistImageFormat>('square')
  const theme = ref<ThemeName>(ui.theme)
  const type = ref<PlaylistImageType>('image/png')
  const textScale = ref(100)
  const textOpacity = ref(100)
  const blob = shallowRef<Blob | null>(null)
  const previewUrl = ref('')

  const size = computed(() => PLAYLIST_IMAGE_SIZES[format.value])

  const FORMAT_OPTIONS = computed(() => [
    { value: 'square' as const, label: t('image.formatSquare') },
    { value: 'portrait' as const, label: t('image.formatPortrait') },
  ])
  const THEME_OPTIONS = computed(() => [
    { value: 'dark' as const, label: t('image.dark') },
    { value: 'light' as const, label: t('image.light') },
  ])
  const TYPE_OPTIONS = [
    { value: 'image/png' as const, label: 'PNG' },
    { value: 'image/jpeg' as const, label: 'JPEG' },
  ]

  // Eigene Farben; beim Wechsel des Farbschemas starten sie wieder bei dessen Werten.
  const textColor = ref(defaultImageColors(theme.value).text)
  const backgroundColor = ref(defaultImageColors(theme.value).background)
  const colors = computed(() => ({ text: textColor.value, background: backgroundColor.value }))
  const customized = computed(() => {
    const preset = defaultImageColors(theme.value)
    return (
      textColor.value.toLowerCase() !== preset.text.toLowerCase() ||
      backgroundColor.value.toLowerCase() !== preset.background.toLowerCase()
    )
  })

  function resetColors() {
    const preset = defaultImageColors(theme.value)
    textColor.value = preset.text
    backgroundColor.value = preset.background
  }

  // sync: die Farben stehen schon fest, bevor das Bild neu gezeichnet wird.
  watch(theme, resetColors, { flush: 'sync' })

  // Eigenes Hintergrundbild, liegt mit `photoOpacity` über der Hintergrundfarbe.
  const photoInput = ref<HTMLInputElement | null>(null)
  const photo = shallowRef<ImageBitmap | null>(null)
  const photoName = ref('')
  const photoOpacity = ref(60)
  const background = computed<ImageBackground | null>(() =>
    photo.value ? { image: photo.value, opacity: photoOpacity.value / 100 } : null,
  )

  // Unter 4,5:1 (WCAG AA) ist der Text auf dem Handy schwer lesbar. Die Textdeckkraft
  // mischt den Text mit dem Hintergrund. Mit Foto entscheidet das Bild über den Kontrast.
  const lowContrast = computed(() => {
    if (photo.value) return false
    const shown = mixColors(textColor.value, backgroundColor.value, 1 - textOpacity.value / 100)
    return contrastRatio(shown, backgroundColor.value) < 4.5
  })

  function setPhoto(next: ImageBitmap | null, name = '') {
    photo.value?.close()
    photo.value = next
    photoName.value = name
  }

  const PHOTO_ERRORS: Record<BackgroundErrorCode, () => string> = {
    type: () => t('image.photoType'),
    size: () => t('image.photoSize'),
    decode: () => t('image.photoDecode'),
  }

  async function handlePhotoChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      setPhoto(await loadBackgroundImage(file), file.name)
    } catch (err) {
      const code = err instanceof BackgroundImageError ? err.code : 'decode'
      logger.error('Hintergrundbild konnte nicht geladen werden:', err)
      toast.error(PHOTO_ERRORS[code]())
    }
  }

  /** Anzeigename: Tag-Titel, sonst Dateiname der Ausgabe ohne Endung. */
  const playlistName = computed(
    () => store.tags.title.trim() || store.outputFileName.replace(/\.[^.]+$/, ''),
  )

  const data = computed<PlaylistImageData>(() => {
    const summary = imageTracks(store.chapters, store.files)
    const duration = formatTotal(summary.totalSeconds)
    return {
      name: playlistName.value || t('image.kicker'),
      tracks: summary.tracks,
      kicker: t('image.kicker'),
      meta: t('image.meta', { count: summary.tracks.length, duration }),
      // {count} bleibt als Platzhalter stehen, die Zahl steht erst beim Zeichnen fest.
      moreLabel: t('image.more', { count: '{count}' }),
      footer: t('image.footer'),
    }
  })

  const canShareFiles = computed(() => {
    if (typeof navigator.canShare !== 'function') return false
    try {
      return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
    } catch {
      return false
    }
  })

  function setPreview(next: Blob | null) {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    blob.value = next
    previewUrl.value = next ? URL.createObjectURL(next) : ''
  }

  // Nur das Ergebnis des letzten Auftrags zählt, wenn schnell umgeschaltet wird.
  let job = 0
  async function render() {
    const current = ++job
    try {
      const result = await renderPlaylistImage(
        data.value,
        format.value,
        {
          theme: theme.value,
          colors: colors.value,
          background: background.value,
          textScale: textScale.value / 100,
          textOpacity: textOpacity.value / 100,
        },
        type.value,
      )
      if (current === job && open.value) setPreview(result)
    } catch (err) {
      if (current !== job) return
      logger.error('Playlist-Bild konnte nicht erzeugt werden:', err)
      setPreview(null)
      toast.error(t('image.error'))
    }
  }

  function onToggle(event: Event) {
    open.value = (event.target as HTMLDetailsElement).open
    if (!open.value) {
      job++
      setPreview(null)
    }
  }

  watch([open, data, format, theme, type, colors, background, textScale, textOpacity], () => {
    if (open.value) void render()
  })

  onBeforeUnmount(() => {
    job++
    setPreview(null)
    setPhoto(null)
  })

  const fileName = () => playlistImageFileName(playlistName.value, format.value, type.value)

  function handleDownload() {
    if (!previewUrl.value) return
    const link = document.createElement('a')
    link.href = previewUrl.value
    link.download = fileName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.success(t('image.saved'))
  }

  async function handleShare() {
    if (!blob.value) return
    const file = new File([blob.value], fileName(), { type: type.value })
    try {
      await navigator.share({ files: [file], title: data.value.name })
    } catch (err) {
      if (errorName(err) === 'AbortError') return
      logger.error('Bild konnte nicht geteilt werden:', err)
      toast.error(t('image.error'))
    }
  }

  const pill = (active: boolean) => [
    'cursor-pointer rounded-md border px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
    active
      ? 'border-accent bg-accent-soft text-ink'
      : 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3',
  ]
</script>

<template>
  <details
    class="group rounded-lg border border-line bg-surface-1 p-4 text-left sm:p-5"
    data-testid="playlist-image"
    @toggle="onToggle"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-md font-semibold text-ink"
    >
      <span>{{ t('image.title') }}</span>
      <svg
        class="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </summary>

    <div v-if="open" class="mt-3 flex flex-col gap-4">
      <p class="text-sm text-ink-3">{{ t('image.description') }}</p>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <fieldset>
          <legend class="mb-1 text-sm font-medium text-ink-2">{{ t('image.format') }}</legend>
          <div class="flex gap-2">
            <label
              v-for="option in FORMAT_OPTIONS"
              :key="option.value"
              :class="pill(format === option.value)"
            >
              <input
                v-model="format"
                type="radio"
                :name="id('format')"
                :value="option.value"
                :data-format="option.value"
                class="sr-only"
              />
              {{ option.label }}
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-1 text-sm font-medium text-ink-2">{{ t('image.theme') }}</legend>
          <div class="flex gap-2">
            <label
              v-for="option in THEME_OPTIONS"
              :key="option.value"
              :class="pill(theme === option.value)"
            >
              <input
                v-model="theme"
                type="radio"
                :name="id('theme')"
                :value="option.value"
                :data-theme-option="option.value"
                class="sr-only"
              />
              {{ option.label }}
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-1 text-sm font-medium text-ink-2">{{ t('image.type') }}</legend>
          <div class="flex gap-2">
            <label
              v-for="option in TYPE_OPTIONS"
              :key="option.value"
              :class="pill(type === option.value)"
            >
              <input
                v-model="type"
                type="radio"
                :name="id('type')"
                :value="option.value"
                :data-type="option.value"
                class="sr-only"
              />
              {{ option.label }}
            </label>
          </div>
        </fieldset>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            v-model="textColor"
            type="color"
            data-color="text"
            class="h-9 w-9 cursor-pointer rounded-sm border border-line bg-surface-2 p-0.5"
          />
          {{ t('image.textColor') }}
        </label>
        <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            v-model="backgroundColor"
            type="color"
            data-color="background"
            class="h-9 w-9 cursor-pointer rounded-sm border border-line bg-surface-2 p-0.5"
          />
          {{ t('image.backgroundColor') }}
        </label>
        <button
          type="button"
          class="rounded-sm px-1 text-sm font-medium text-link hover:underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
          :disabled="!customized"
          data-action="reset-colors"
          @click="resetColors"
        >
          {{ t('image.resetColors') }}
        </button>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex items-center gap-3">
          <label :for="id('text-size')" class="w-28 shrink-0 text-sm text-ink-2">
            {{ t('image.textSize') }}
          </label>
          <input
            :id="id('text-size')"
            v-model.number="textScale"
            type="range"
            :min="TEXT_SCALE_MIN"
            :max="TEXT_SCALE_MAX"
            step="5"
            data-input="text-size"
            class="w-full accent-accent"
          />
          <output class="w-12 shrink-0 whitespace-nowrap text-right text-sm tabular-nums text-ink"
            >{{ textScale }} %</output
          >
        </div>
        <div class="flex items-center gap-3">
          <label :for="id('text-opacity')" class="w-28 shrink-0 text-sm text-ink-2">
            {{ t('image.textOpacity') }}
          </label>
          <input
            :id="id('text-opacity')"
            v-model.number="textOpacity"
            type="range"
            :min="TEXT_OPACITY_MIN"
            max="100"
            step="5"
            data-input="text-opacity"
            class="w-full accent-accent"
          />
          <output class="w-12 shrink-0 whitespace-nowrap text-right text-sm tabular-nums text-ink"
            >{{ textOpacity }} %</output
          >
        </div>
      </div>

      <p
        v-if="lowContrast"
        role="status"
        class="rounded-md border border-l-[3px] border-line border-l-warning bg-surface-2 px-3 py-2 text-sm text-ink"
        data-testid="low-contrast"
      >
        {{ t('image.lowContrast') }}
      </p>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
        <input
          ref="photoInput"
          type="file"
          class="hidden"
          :accept="BACKGROUND_TYPES.join(',')"
          tabindex="-1"
          data-input="background-image"
          @change="handlePhotoChange"
        />
        <button
          type="button"
          class="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3"
          data-action="pick-background"
          @click="photoInput?.click()"
        >
          {{ photo ? t('image.photoReplace') : t('image.photoPick') }}
        </button>
        <template v-if="photo">
          <span class="max-w-48 truncate" :title="photoName">{{ photoName }}</span>
          <label class="inline-flex items-center gap-2">
            {{ t('image.photoOpacity') }}
            <input
              v-model.number="photoOpacity"
              type="range"
              min="0"
              max="100"
              step="5"
              data-input="background-opacity"
              class="w-32 accent-accent"
            />
            <output class="w-12 shrink-0 whitespace-nowrap tabular-nums text-ink"
              >{{ photoOpacity }} %</output
            >
          </label>
          <button
            type="button"
            class="text-sm font-medium text-danger hover:underline"
            data-action="remove-background"
            @click="setPhoto(null)"
          >
            {{ t('image.photoRemove') }}
          </button>
        </template>
        <span v-else class="text-ink-3">{{ t('image.photoHint') }}</span>
      </div>

      <div
        class="flex w-full items-center justify-center self-center overflow-hidden rounded-md border border-line bg-surface-2"
        :class="format === 'square' ? 'max-w-[60vh]' : 'max-w-[40vh]'"
        :style="{ aspectRatio: `${size.width} / ${size.height}` }"
      >
        <img
          v-if="previewUrl"
          class="block h-full w-full object-contain"
          :src="previewUrl"
          :alt="t('image.previewAlt')"
          :width="size.width"
          :height="size.height"
          data-testid="image-preview"
        />
        <span v-else class="text-sm text-ink-3" role="status">{{ t('image.rendering') }}</span>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <button
          v-if="canShareFiles"
          type="button"
          :disabled="!blob"
          class="inline-flex h-control-md items-center rounded-md border border-line bg-surface-1 px-4 text-md font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
          data-action="share"
          @click="handleShare"
        >
          {{ t('image.share') }}
        </button>
        <button
          type="button"
          :disabled="!blob"
          class="inline-flex h-control-md items-center rounded-md bg-accent px-4 text-md font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
          data-action="download"
          @click="handleDownload"
        >
          {{ t('image.download') }}
        </button>
      </div>
    </div>
  </details>
</template>
