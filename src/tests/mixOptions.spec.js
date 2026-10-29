/**
 * N4: Pause/Crossfade zwischen Tracks, N5: Lautheitsangleichung.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRequire } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import MixOptions from '../components/MixOptions.vue'
import {
  useConverterStore,
  normalizeTransition,
  normalizeTransitionSeconds,
} from '../stores/converter'
import { MAX_TRANSITION_SECONDS, MIN_TRANSITION_SECONDS, TRANSITION_TYPES } from '../constants'
import * as api from '../api/converter'

vi.mock('../api/converter', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFiles: vi.fn(),
  startConversion: vi.fn(),
  subscribeStatus: vi.fn(() => () => {}),
}))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  i18n.global.locale.value = 'de'
  vi.clearAllMocks()
})

describe('Übergang und Lautheit im Store', () => {
  it('Standard: direkt, 2 s, keine Angleichung', () => {
    const store = useConverterStore()
    expect([store.transition, store.transitionSeconds, store.loudnorm]).toEqual(['none', 2, false])
  })

  it('normalisiert gespeicherte Werte wie der Server', () => {
    expect(normalizeTransition('gap')).toBe('gap')
    expect(normalizeTransition('wipe')).toBe('none')
    expect(normalizeTransition(null)).toBe('none')
    expect(normalizeTransitionSeconds('1.3')).toBe(1.5)
    expect(normalizeTransitionSeconds(0)).toBe(0.5)
    expect(normalizeTransitionSeconds(99)).toBe(10)
    expect(normalizeTransitionSeconds('x')).toBe(2)
  })

  it('speichert die Einstellungen und liest sie beim Start', () => {
    const store = useConverterStore()
    store.setTransition('crossfade')
    store.setTransitionSeconds(3.5)
    store.setLoudnorm(true)
    setActivePinia(createPinia())
    const fresh = useConverterStore()
    expect([fresh.transition, fresh.transitionSeconds, fresh.loudnorm]).toEqual([
      'crossfade',
      3.5,
      true,
    ])
  })

  it('convert schickt Übergang und Lautheit an den Server', async () => {
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    const store = useConverterStore()
    store.files = [{ id: 1, name: 'a.mp3', size: 1, file: new File(['x'], 'a.mp3') }]
    store.setTransition('gap')
    store.setTransitionSeconds(1)
    store.setLoudnorm(true)
    await store.convert()
    expect(api.startConversion).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ transition: 'gap', transition_seconds: 1, loudnorm: true }),
      expect.anything(),
    )
  })

  it('Grenzen und Typen stimmen mit dem Server überein', () => {
    const require = createRequire(import.meta.url)
    const server = require('../../server/transitions.js')
    expect([...TRANSITION_TYPES]).toEqual(server.TRANSITIONS)
    expect(MIN_TRANSITION_SECONDS).toBe(server.MIN_TRANSITION_SECONDS)
    expect(MAX_TRANSITION_SECONDS).toBe(server.MAX_TRANSITION_SECONDS)
  })
})

describe('MixOptions', () => {
  const mountIt = () => mount(MixOptions, { global: { plugins: [i18n] } })

  it('Dauer und Hinweis erscheinen erst mit einem Übergang', async () => {
    const wrapper = mountIt()
    const store = useConverterStore()
    expect(wrapper.find('[data-testid="transition-seconds"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reencode-hint"]').exists()).toBe(false)

    await wrapper.get('[data-transition="crossfade"]').setValue()
    expect(store.transition).toBe('crossfade')
    await wrapper.get('[data-testid="transition-seconds"]').setValue('4.5')
    expect(store.transitionSeconds).toBe(4.5)
    expect(wrapper.text()).toContain('4,5 s')
    expect(wrapper.find('[data-testid="reencode-hint"]').exists()).toBe(true)
  })

  it('Checkbox schaltet die Lautheitsangleichung', async () => {
    const wrapper = mountIt()
    await wrapper.get('[data-testid="loudnorm"]').setValue(true)
    expect(useConverterStore().loudnorm).toBe(true)
    expect(wrapper.find('[data-testid="reencode-hint"]').exists()).toBe(true)
  })
})
