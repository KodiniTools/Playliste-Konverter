<script setup>
  import { ref, computed, watch, onMounted } from 'vue'
  import { useConverterStore } from './stores/converter'
  import { useUIStore } from './stores/ui'
  import { useI18n } from 'vue-i18n'
  import FileUploader from './components/FileUploader.vue'
  import FileList from './components/FileList.vue'
  import FormatSelector from './components/FormatSelector.vue'
  import ConversionProgress from './components/ConversionProgress.vue'
  import DownloadButton from './components/DownloadButton.vue'
  import SizeWarning from './components/SizeWarning.vue'
  import ToastContainer from './components/ToastContainer.vue'
  import StickyPlayer from './components/StickyPlayer.vue'
  import StatusIcon from './components/StatusIcon.vue'
  import { getSharedFiles, clearSharedFiles } from './utils/sharedFileRepository'

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

  // --- source=audionormalizer receiver ---
  const sharedBanner = ref(null)

  const BANNER_EDGE_CLASSES = {
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
    info: 'border-l-info',
  }
  const bannerEdgeClass = computed(
    () => BANNER_EDGE_CLASSES[sharedBanner.value?.type] ?? BANNER_EDGE_CLASSES.info,
  )
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
        message: t('sharedFiles.loading', { count: records.length }),
      }

      const files = records.map(
        (r) => new File([r.blob], r.name, { type: r.mimeType || r.blob.type }),
      )
      store.addFiles(files)
      await clearSharedFiles()

      sharedBanner.value = {
        type: 'success',
        message: t('sharedFiles.loaded', { count: files.length }),
      }
    } catch (err) {
      console.error('[Playliste-Konverter] Error loading shared files:', err)
      sharedBanner.value = { type: 'error', message: t('sharedFiles.error') }
    }

    setTimeout(() => {
      sharedBanner.value = null
    }, 6000)
  }

  onMounted(() => {
    const source = new URLSearchParams(window.location.search).get('source')
    if (source === 'audionormalizer') loadSharedFiles()
  })
</script>

<template>
  <ToastContainer />
  <div class="min-h-screen py-4 sm:py-8" :class="{ 'pb-28 sm:pb-24': showPlayer }">
    <div class="mx-auto max-w-4xl px-3 sm:px-4">
      <header class="mb-6 sm:mb-8">
        <div class="mb-4 flex flex-col items-center gap-2 text-center">
          <div class="flex items-center gap-2 sm:gap-3">
            <a href="./" class="home-link flex-shrink-0" title="Home" aria-label="Home">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </a>
            <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {{ t('app.title') }}
            </h1>
            <!-- PayPal Donation Button -->
            <form
              action="https://www.paypal.com/donate"
              method="post"
              target="_top"
              class="inline-block"
            >
              <input type="hidden" name="hosted_button_id" value="8RGLGQ2BFMHU6" />
              <button
                type="submit"
                class="donate-btn"
                :title="t('donate.title')"
                :aria-label="t('donate.button')"
              >
                <svg
                  class="donate-btn-icon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  />
                </svg>
                <span class="hidden sm:inline">{{ t('donate.button') }}</span>
              </button>
            </form>
          </div>
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

        <!-- Size Warning / All Clear -->
        <SizeWarning />

        <button
          v-if="store.files.length > 0"
          type="button"
          :disabled="store.isOverSizeLimit"
          class="w-full rounded-md bg-accent py-3 text-lg font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-accent"
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

      <DownloadButton v-else />

      <div
        v-if="store.errorMessage"
        role="alert"
        class="mt-4 flex items-start gap-3 rounded-md border border-l-[3px] border-line border-l-danger bg-surface-1 p-4"
      >
        <StatusIcon type="error" class="mt-0.5 h-5 w-5" />
        <div class="flex-1">
          <p class="text-md text-ink">{{ store.errorMessage }}</p>
          <button
            type="button"
            class="mt-2 text-md font-medium text-link underline transition-colors hover:text-accent"
            @click="store.reset"
          >
            {{ t('error.reset') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Dauerhaft sichtbarer Sticky-Player am unteren Rand -->
  <StickyPlayer v-if="showPlayer" />
</template>
