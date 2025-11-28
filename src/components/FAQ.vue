<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale, tm } = useI18n()
const openIndex = ref(null)

// FAQ-Fragen als computed property, um reaktiv auf Sprachänderungen zu reagieren
const faqQuestions = computed(() => {
  return tm('faq.questions')
})

function toggleQuestion(index) {
  openIndex.value = openIndex.value === index ? null : index
}
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-6">
    <h2 class="text-2xl font-bold text-dark dark:text-neutral-light mb-6">
      {{ t('faq.title') }}
    </h2>

    <div class="space-y-3">
      <div
        v-for="(item, index) in faqQuestions"
        :key="index"
        class="border border-neutral dark:border-muted rounded-lg overflow-hidden transition-all"
      >
        <!-- Question -->
        <button
          @click="toggleQuestion(index)"
          class="w-full flex items-center justify-between p-4 text-left bg-neutral-light dark:bg-dark-lighter hover:bg-neutral/30 dark:hover:bg-muted/30 transition-colors"
        >
          <span class="font-semibold text-dark dark:text-neutral-light pr-4">
            {{ item.q }}
          </span>
          <svg
            :class="[
              'w-5 h-5 text-muted dark:text-neutral transition-transform flex-shrink-0',
              openIndex === index ? 'transform rotate-180' : ''
            ]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Answer -->
        <div
          v-show="openIndex === index"
          class="p-4 bg-white dark:bg-dark-card border-t border-neutral dark:border-muted"
        >
          <p class="text-muted dark:text-neutral leading-relaxed">
            {{ item.a }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
