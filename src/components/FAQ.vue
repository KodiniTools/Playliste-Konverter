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
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
      {{ t('faq.title') }}
    </h2>

    <div class="space-y-3">
      <div
        v-for="(item, index) in faqQuestions"
        :key="index"
        class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden transition-all"
      >
        <!-- Question -->
        <button
          @click="toggleQuestion(index)"
          class="w-full flex items-center justify-between p-4 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
        >
          <span class="font-semibold text-gray-900 dark:text-gray-100 pr-4">
            {{ item.q }}
          </span>
          <svg
            :class="[
              'w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0',
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
          class="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600"
        >
          <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
            {{ item.a }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
