/**
 * N6: Dateiname, Tags und Cover der Ausgabe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import OutputDetails from '../components/OutputDetails.vue'
import { useConverterStore, sanitizeOutputName, cleanTags } from '../stores/converter'
import { useToastStore } from '../stores/toast'
import { MAX_COVER_SIZE } from '../constants'
import * as api from '../api/converter'

vi.mock('../api/converter', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFiles: vi.fn(),
  uploadCover: vi.fn(),
  startConversion: vi.fn(),
  subscribeStatus: vi.fn(() => () => {}),
}))

const audio = () => [{ id: 1, name: 'a.mp3', size: 1, file: new File(['x'], 'a.mp3') }]
const jpeg = (size = 10) => new File([new Uint8Array(size)], 'cover.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  i18n.global.locale.value = 'de'
  vi.clearAllMocks()
  api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
  api.uploadCover.mockResolvedValue({ data: {} })
  api.startConversion.mockResolvedValue({ data: {} })
})

describe('Dateiname und Tags', () => {
  it('sanitizeOutputName entfernt Pfad- und Sonderzeichen, leer → playlist', () => {
    expect(sanitizeOutputName('Sommer Mix')).toBe('Sommer Mix')
    expect(sanitizeOutputName('../a/b:c*?')).toBe('_a_b_c__')
    expect(sanitizeOutputName('  ...  ')).toBe('playlist')
    expect(sanitizeOutputName('x'.repeat(150))).toHaveLength(100)
  })

  it('cleanTags lässt leere Felder weg und trimmt', () => {
    expect(cleanTags({ title: ' Mix ', artist: '', album: '  ' })).toEqual({ title: 'Mix' })
  })

  it('Dateiname folgt dem Format, convert schickt Name und Tags', async () => {
    const store = useConverterStore()
    store.files = audio()
    store.outputName = 'Sommer: Mix'
    store.tags.artist = ' Kodini '
    expect(store.outputFileName).toBe('Sommer_ Mix.mp3')
    store.setOutputFormat('ogg')
    expect(store.outputFileName).toBe('Sommer_ Mix.ogg')
    await store.convert()
    expect(api.startConversion).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ filename: 'Sommer_ Mix', tags: { artist: 'Kodini' } }),
      expect.anything(),
    )
  })
})

describe('Cover', () => {
  it('setCover lehnt falsche Typen und zu große Bilder ab', () => {
    const store = useConverterStore()
    expect(store.setCover(new File(['x'], 'a.gif'))).toBe(false)
    expect(store.setCover(jpeg(MAX_COVER_SIZE + 1))).toBe(false)
    expect(store.cover).toBeNull()
    expect(useToastStore().toasts).toHaveLength(2)
    expect(store.setCover(jpeg())).toBe(true)
    expect(store.cover?.name).toBe('cover.jpg')
  })

  it('Cover wird nur bei MP3 vor dem Start hochgeladen', async () => {
    const store = useConverterStore()
    store.files = audio()
    store.setCover(jpeg())
    await store.convert()
    expect(api.uploadCover).toHaveBeenCalledWith('s1', store.cover, expect.anything())
    expect(api.uploadCover.mock.invocationCallOrder[0]).toBeLessThan(
      api.startConversion.mock.invocationCallOrder[0],
    )

    vi.clearAllMocks()
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's2' } })
    api.startConversion.mockResolvedValue({ data: {} })
    store.reset()
    store.files = audio()
    store.setOutputFormat('webm')
    store.setCover(jpeg())
    await store.convert()
    expect(api.uploadCover).not.toHaveBeenCalled()
    expect(api.startConversion).toHaveBeenCalled()
  })

  it('reset leert Name, Tags und Cover', () => {
    const store = useConverterStore()
    store.outputName = 'x'
    store.tags.title = 'y'
    store.setCover(jpeg())
    store.reset()
    expect([store.outputName, store.tags.title, store.cover]).toEqual(['', '', null])
  })
})

describe('OutputDetails', () => {
  const mountIt = () => mount(OutputDetails, { global: { plugins: [i18n] } })

  it('bindet Name und Tags an den Store und zeigt den Dateinamen', async () => {
    const wrapper = mountIt()
    const store = useConverterStore()
    await wrapper.get('[data-testid="output-name"]').setValue('Roadtrip')
    await wrapper.get('[data-testid="tag-album"]').setValue('Sommer')
    expect(store.outputName).toBe('Roadtrip')
    expect(store.tags.album).toBe('Sommer')
    expect(wrapper.get('[data-testid="output-file-name"]').text()).toContain('Roadtrip.mp3')
  })

  it('warnt, wenn das Cover beim gewählten Format wegfällt', async () => {
    URL.createObjectURL ??= () => 'blob:x'
    URL.revokeObjectURL ??= () => {}
    const wrapper = mountIt()
    const store = useConverterStore()
    store.setCover(jpeg())
    store.setOutputFormat('ogg')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain(i18n.global.t('output.coverMp3Only'))
  })
})
