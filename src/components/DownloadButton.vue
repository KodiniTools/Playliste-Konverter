<script setup>
import { useConverterStore } from '../stores/converter'

const store = useConverterStore()
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6 text-center">
    <svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 class="text-xl font-semibold text-gray-900 mb-2">Konvertierung abgeschlossen!</h3>
    <p class="text-gray-600 mb-6">Deine Playlist ist bereit zum Download</p>
    
    <a
      :href="store.downloadUrl"
      download="playlist.webm"
      class="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
    >
      playlist.webm herunterladen
    </a>

    <button
      @click="store.reset"
      class="block mx-auto mt-4 text-sm text-gray-600 hover:underline"
    >
      Neue Konvertierung starten
    </button>
  </div>
</template>
