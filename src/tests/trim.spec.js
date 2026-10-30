/**
 * N9: Tracks zuschneiden und Stille am Rand entfernen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import FileList from '../components/FileList.vue'
import MixOptions from '../components/MixOptions.vue'
import { useConverterStore, effectiveDuration, trimOf } from '../stores/converter'
import { formatTrimTime, parseTime } from '../utils/format'
import * as api from '../api/converter'

vi.mock('../utils/audioDuration', () => ({ probeDuration: vi.fn(() => new Promise(() => {})) }))
vi.mock('../api/converter', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFiles: vi.fn(),
  startConversion: vi.fn(),
  subscribeStatus: vi.fn(() => () => {}),
}))

let pinia

const track = (id, duration = 120) => ({
  id,
  name: `t${id}.mp3`,
  size: 1,
  file: new File(['x'], `t${id}.mp3`),
  duration,
})

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  vi.clearAllMocks()
})

describe('Zeitangaben', () => {
  it.each([
    ['83', 83],
    ['1:23', 83],
    ['1:23,5', 83.5],
    ['1:23.5', 83.5],
    ['1:02:03', 3723],
    [' 0:15 ', 15],
  ])('parseTime(%s) = %s', (text, seconds) => {
    expect(parseTime(text)).toBe(seconds)
  })

  it.each(['', 'abc', '1:75', '-3', '1::2', '1:2:3:4'])('parseTime(%s) ist ungültig', (text) => {
    expect(parseTime(text)).toBeNull()
  })

  it('formatTrimTime zeigt Zehntel nur bei Bedarf', () => {
    expect(formatTrimTime(83)).toBe('1:23')
    expect(formatTrimTime(83.5)).toBe('1:23.5')
    expect(formatTrimTime(3723)).toBe('1:02:03')
  })
})

describe('Zuschnitt im Store', () => {
  it('setTrim prüft den Bereich gegen die Dauer', () => {
    const store = useConverterStore()
    store.files = [track(1, 120)]
    expect(store.setTrim(1, 10, 5)).toBe(false)
    expect(store.setTrim(1, 130, null)).toBe(false)
    expect(store.setTrim(1, null, 200)).toBe(false)
    expect(store.setTrim(1, 10, 100)).toBe(true)
    expect(store.files[0]).toMatchObject({ trimStart: 10, trimEnd: 100 })
    // 0 und Ende = Dauer zählen als „nicht geschnitten“
    expect(store.setTrim(1, 0, 120)).toBe(true)
    expect(trimOf(store.files[0])).toBeNull()
  })

  it('Gesamtdauer berücksichtigt Zuschnitt und Übergänge', () => {
    const store = useConverterStore()
    store.files = [track(1, 120), track(2, 60)]
    store.setTrim(1, 20, 80)
    expect(effectiveDuration(store.files[0])).toBe(60)
    expect(store.totalDuration).toBe(120)
    store.setTransition('gap')
    store.setTransitionSeconds(2)
    expect(store.totalDuration).toBe(122)
    store.setTransition('crossfade')
    expect(store.totalDuration).toBe(118)
  })

  it('convert schickt Zuschnitt je Track und die Stille-Option', async () => {
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    const store = useConverterStore()
    store.files = [track(1), track(2)]
    store.setTrim(2, 5, null)
    store.setTrimSilence(true)
    await store.convert()
    expect(api.startConversion).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        tracks: [null, { start: 5, end: null }],
        trim_silence: true,
      }),
      expect.anything(),
    )
  })

  it('Stille-Option wird gespeichert', () => {
    useConverterStore().setTrimSilence(true)
    setActivePinia(createPinia())
    expect(useConverterStore().trimSilence).toBe(true)
  })
})

describe('Zuschneiden in der Trackliste', () => {
  function mountList() {
    const store = useConverterStore()
    store.files = [track(1, 125), track(2, 60)]
    return { store, wrapper: mount(FileList, { global: { plugins: [pinia, i18n] } }) }
  }

  it('öffnet den Editor, übernimmt Start/Ende und zeigt den Bereich', async () => {
    const { store, wrapper } = mountList()
    const toggle = wrapper.get('[data-trim-toggle="1"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')

    await wrapper.get('[data-testid="trim-start"]').setValue('0:15')
    await wrapper.get('[data-testid="trim-end"]').setValue('1:30,5')
    expect(store.files[0]).toMatchObject({ trimStart: 15, trimEnd: 90.5 })
    expect(wrapper.get('[data-testid="trim-badge"]').text()).toContain('0:15–1:30.5')

    // nur ein Editor gleichzeitig
    await wrapper.get('[data-trim-toggle="2"]').trigger('click')
    expect(wrapper.findAll('[data-trim-editor]')).toHaveLength(1)
  })

  it('meldet ungültige Eingaben und lässt den Zuschnitt unverändert', async () => {
    const { store, wrapper } = mountList()
    await wrapper.get('[data-trim-toggle="1"]').trigger('click')
    await wrapper.get('[data-testid="trim-start"]').setValue('2:00')
    await wrapper.get('[data-testid="trim-end"]').setValue('1:00')
    expect(wrapper.get('[data-testid="trim-end"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Ungültiger Bereich')
    expect(store.files[0].trimEnd).toBeUndefined()
  })

  it('„Ganzen Track verwenden“ hebt den Zuschnitt auf', async () => {
    const { store, wrapper } = mountList()
    store.setTrim(1, 10, null)
    await wrapper.get('[data-trim-toggle="1"]').trigger('click')
    expect(wrapper.get('[data-testid="trim-start"]').element.value).toBe('0:10')
    await wrapper.get('[data-trim-editor="1"] button').trigger('click')
    expect(trimOf(store.files[0])).toBeNull()
    expect(wrapper.find('[data-testid="trim-badge"]').exists()).toBe(false)
  })
})

describe('MixOptions: Stille entfernen', () => {
  it('Checkbox schaltet die Option und zeigt den Neukodierungs-Hinweis', async () => {
    const wrapper = mount(MixOptions, { global: { plugins: [pinia, i18n] } })
    expect(wrapper.find('[data-testid="reencode-hint"]').exists()).toBe(false)
    await wrapper.get('[data-testid="trim-silence"]').setValue(true)
    expect(useConverterStore().trimSilence).toBe(true)
    expect(wrapper.find('[data-testid="reencode-hint"]').exists()).toBe(true)
  })
})
