<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { useConverterStore } from './stores/converter'
  import { useUIStore } from './stores/ui'
  import { useI18n } from 'vue-i18n'
  import FileUploader from './components/FileUploader.vue'
  import FileList from './components/FileList.vue'
  import FormatSelector from './components/FormatSelector.vue'
  import OutputDetails from './components/OutputDetails.vue'
  import MixOptions from './components/MixOptions.vue'
  import ConversionProgress from './components/ConversionProgress.vue'
  import DownloadButton from './components/DownloadButton.vue'
  import PlaylistImage from './components/PlaylistImage.vue'
  import SizeWarning from './components/SizeWarning.vue'
  import ToastContainer from './components/ToastContainer.vue'
  import StickyPlayer from './components/StickyPlayer.vue'
  import StatusIcon from './components/StatusIcon.vue'
  import { getSharedFiles, clearSharedFiles } from './utils/sharedFileRepository'
  import { logger } from './utils/logger'
  import { isSharedSource } from './constants'
  import kodiniLogo from './assets/kodinitools-logo.png'

  const store = useConverterStore()
  const uiStore = useUIStore()
  const { t, locale } = useI18n()

  // Sticky-Player anzeigen, solange Tracks in der Playlist bearbeitet werden
  const showPlayer = computed(() => store.status === 'idle' && store.files.length > 0)

  // vue-i18n Locale mit UI-Store synchronisieren (gesteuert von SSI-Navigation)
  watch(
    () => uiStore.locale,
    (newLocale) => {
      locale.value = newLocale
    },
    { immediate: true },
  )

  // --- Empfang geteilter Dateien (?source=audionormalizer|audiokonverter, N8) ---
  type BannerType = 'success' | 'error' | 'warning' | 'info'
  const sharedBanner = ref<{ type: BannerType; message: string } | null>(null)

  const BANNER_EDGE_CLASSES: Record<BannerType, string> = {
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
    info: 'border-l-info',
  }
  const bannerEdgeClass = computed(() => BANNER_EDGE_CLASSES[sharedBanner.value?.type ?? 'info'])
  let sharedHandled = false

  async function loadSharedFiles() {
    if (sharedHandled) return
    sharedHandled = true

    try {
      const records = await getSharedFiles()
      if (!records?.length) {
        sharedBanner.value = { type: 'warning', message: t('sharedFiles.empty') }
        setTimeout(() => {
          sharedBanner.value = null
        }, 5000)
        return
      }

      sharedBanner.value = {
        type: 'info',
        message: t('sharedFiles.loading', records.length),
      }

      const files = records.map(
        (r) => new File([r.blob], r.name, { type: r.mimeType || r.blob.type }),
      )
      store.addFiles(files)
      await clearSharedFiles()

      sharedBanner.value = {
        type: 'success',
        message: t('sharedFiles.loaded', files.length),
      }
    } catch (err) {
      logger.error('Geteilte Dateien konnten nicht geladen werden:', err)
      sharedBanner.value = { type: 'error', message: t('sharedFiles.error') }
    }

    setTimeout(() => {
      sharedBanner.value = null
    }, 6000)
  }

  onMounted(() => {
    const source = new URLSearchParams(window.location.search).get('source')
    if (isSharedSource(source)) loadSharedFiles()
  })
</script>

<template>
  <ToastContainer />
  <div class="converter-shell min-h-screen py-4 sm:py-8" :class="{ 'pb-28 sm:pb-24': showPlayer }">
    <div class="converter-content mx-auto">
      <header class="converter-app-header">
        <nav class="converter-nav" :aria-label="t('app.title')">
          <a href="./" class="converter-brand">
            <img :src="kodiniLogo" width="36" height="36" alt="" />
            <span>{{ t('app.title') }}</span>
          </a>
          <div class="converter-nav-links">
            <span aria-current="page" class="nav-link">{{ t('nav.converter') }}</span>
            <a href="./faq.html" class="nav-link">FAQ</a>
            <a href="./funktion.html" class="nav-link">{{ t('nav.guide') }}</a>
          </div>
        </nav>
        <div class="converter-header-title">
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {{ t('app.title') }}
          </h1>
          <p class="text-md text-ink-2 sm:text-lg">{{ t('app.subtitle') }}</p>
        </div>
      </header>

      <!-- Shared files banner -->
      <div
        v-if="sharedBanner"
        :role="sharedBanner.type === 'error' ? 'alert' : 'status'"
        :class="[
          'mb-4 flex items-center gap-3 rounded-md border border-l-[3px] border-line bg-surface-1 px-4 py-3 text-md font-medium text-ink',
          bannerEdgeClass,
        ]"
      >
        <StatusIcon :type="sharedBanner.type" class="h-4 w-4" />
        <span>{{ sharedBanner.message }}</span>
      </div>

      <div v-if="store.status === 'idle'" class="space-y-6">
        <FileUploader />
        <FileList v-if="store.files.length > 0" />

        <!-- Format Selector -->
        <FormatSelector v-if="store.files.length > 0" />
        <MixOptions v-if="store.files.length > 0" />
        <OutputDetails v-if="store.files.length > 0" />

        <!-- Size Warning / All Clear -->
        <SizeWarning />

        <button
          v-if="store.files.length > 0"
          type="button"
          :disabled="store.isOverSizeLimit"
          class="converter-submit w-full rounded-md bg-accent py-3 text-lg font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-accent"
          @click="store.convert"
        >
          <span class="inline-flex items-center justify-center gap-2">
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {{ store.files.length }} {{ t('button.convert') }}
          </span>
        </button>
      </div>

      <ConversionProgress v-else-if="store.status !== 'done'" />

      <div v-else class="space-y-6">
        <DownloadButton />
        <PlaylistImage />
      </div>

      <div
        v-if="store.errorMessage"
        role="alert"
        class="mt-4 flex items-start gap-3 rounded-md border border-l-[3px] border-line border-l-danger bg-surface-1 p-4"
      >
        <StatusIcon type="error" class="mt-0.5 h-5 w-5" />
        <div class="flex-1">
          <p class="text-md text-ink">{{ store.errorMessage }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-4">
            <button
              v-if="store.canResume"
              type="button"
              data-testid="resume-upload"
              class="inline-flex h-control-sm items-center rounded-md bg-accent px-4 text-md font-semibold text-on-accent transition-colors hover:bg-accent-hover"
              @click="store.resumeUpload"
            >
              {{ t('error.resume') }}
            </button>
            <button
              type="button"
              class="text-md font-medium text-link underline transition-colors hover:text-accent"
              @click="store.resetJob"
            >
              {{ t('error.reset') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Dauerhaft sichtbarer Sticky-Player am unteren Rand -->
  <StickyPlayer v-if="showPlayer" />
</template>
