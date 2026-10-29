/**
 * N3: Track- und Gesamtdauer werden im Hintergrund ermittelt und angezeigt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import FileList from '../components/FileList.vue'
import { useConverterStore } from '../stores/converter'
import { useToastStore } from '../stores/toast'
import { formatDuration } from '../utils/format'
import { probeDuration } from '../utils/audioDuration'

vi.mock('../utils/audioDuration', () => ({ probeDuration: vi.fn() }))

let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  probeDuration.mockReset()
})

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [187, '3:07'],
    [3600, '1:00:00'],
    [3725.6, '1:02:06'],
  ])('%s s → %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})

describe('Dauer im Store', () => {
  it('ermittelt die Dauern nacheinander und summiert sie', async () => {
    probeDuration.mockResolvedValueOnce(120).mockResolvedValueOnce(65.4)
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3'), new File(['y'], 'b.mp3')])
    expect(store.durationsPending).toBe(true)
    await flushPromises()
    expect(store.files.map((f) => f.duration)).toEqual([120, 65.4])
    expect(store.totalDuration).toBeCloseTo(185.4)
    expect(store.durationsPending).toBe(false)
    expect(store.durationsIncomplete).toBe(false)
  })

  it('unlesbare Datei: Dauer null, Gesamtdauer als Mindestwert', async () => {
    probeDuration.mockResolvedValueOnce(60).mockResolvedValueOnce(null)
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3'), new File(['y'], 'b.wav')])
    await flushPromises()
    expect(store.durationsIncomplete).toBe(true)

    const wrapper = mount(FileList, { global: { plugins: [pinia, i18n] } })
    expect(wrapper.text()).toContain('Gesamtdauer: ≥ 1:00')
    expect(wrapper.text()).toContain('1:00')
  })

  it('Track entfernt, bevor seine Dauer feststeht: kein Fehler', async () => {
    let resolveFirst
    probeDuration.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    probeDuration.mockResolvedValueOnce(30)
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3'), new File(['y'], 'b.mp3')])
    store.removeFile(store.files[0].id)
    resolveFirst(99)
    await flushPromises()
    expect(store.files.map((f) => f.duration)).toEqual([30])
  })
})

describe('Duplikate und Sortieren in der Liste (N7)', () => {
  it('warnt beim Hinzufügen und markiert das Duplikat', async () => {
    probeDuration.mockResolvedValue(10)
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3')])
    store.addFiles([new File(['x'], 'A.mp3'), new File(['zz'], 'b.mp3')])
    const toasts = useToastStore().toasts.map((toast) => toast.message)
    expect(toasts).toContain('1 Datei ist bereits in der Playlist')

    const wrapper = mount(FileList, { global: { plugins: [pinia, i18n] } })
    const rows = wrapper.findAll('[data-track-id][data-move="up"]')
    expect(rows).toHaveLength(3)
    expect(wrapper.text().match(/Duplikat/g)).toHaveLength(1)
  })

  it('Sortier-Buttons ordnen die Playlist und sagen es an', async () => {
    probeDuration.mockResolvedValue(10)
    const store = useConverterStore()
    store.addFiles([
      new File(['x'], '02 b.mp3'),
      new File(['x'], '10 c.mp3'),
      new File(['x'], '01 a.mp3'),
    ])
    const wrapper = mount(FileList, { global: { plugins: [pinia, i18n] } })

    await wrapper.get('[data-sort="trackNumber"]').trigger('click')
    expect(store.files.map((f) => f.name)).toEqual(['01 a.mp3', '02 b.mp3', '10 c.mp3'])
    await wrapper.get('[data-sort="reverse"]').trigger('click')
    expect(store.files.map((f) => f.name)).toEqual(['10 c.mp3', '02 b.mp3', '01 a.mp3'])
    await wrapper.get('[data-sort="name"]').trigger('click')
    expect(store.files.map((f) => f.name)).toEqual(['01 a.mp3', '02 b.mp3', '10 c.mp3'])
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Playlist sortiert: A–Z.')
  })

  it('bei nur einem Track keine Sortier-Buttons', () => {
    const store = useConverterStore()
    store.files = [{ id: 1, name: 'a.mp3', size: 1 }]
    const wrapper = mount(FileList, { global: { plugins: [pinia, i18n] } })
    expect(wrapper.find('[data-sort]').exists()).toBe(false)
  })
})
