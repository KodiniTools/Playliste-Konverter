<script setup>
import { useConverterStore } from './stores/converter'
import FileUploader from './components/FileUploader.vue'
import FileList from './components/FileList.vue'
import ConversionProgress from './components/ConversionProgress.vue'
import DownloadButton from './components/DownloadButton.vue'

const store = useConverterStore()
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-4xl mx-auto px-4">
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Playlist zu WebM Konverter</h1>
        <p class="text-gray-600 mt-2">Bis zu 50 Audio-Tracks in eine WebM-Datei konvertieren</p>
        <p class="text-sm text-orange-600 mt-1">⚠️ Verarbeitung erfolgt auf dem Server</p>
      </header>

      <div v-if="store.status === 'idle'" class="space-y-6">
        <FileUploader />
        <FileList v-if="store.files.length > 0" />
        <button
          v-if="store.files.length > 0"
          @click="store.convert"
          class="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold"
        >
          {{ store.files.length }} Track(s) konvertieren
        </button>
      </div>

      <ConversionProgress v-else-if="store.status !== 'done'" />
      
      <DownloadButton v-else />

      <div v-if="store.errorMessage" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-red-800">{{ store.errorMessage }}</p>
        <button @click="store.reset" class="mt-2 text-red-600 underline">Zurücksetzen</button>
      </div>
    </div>
  </div>
</template>
