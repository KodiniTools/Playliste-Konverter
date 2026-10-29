/**
 * moveFile verschiebt nur innerhalb der Liste; ungültige Indizes ändern nichts
 * (vorher fügte splice(-1, …) den Track an vorletzter Stelle ein).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConverterStore } from '../stores/converter'

describe('converter.moveFile', () => {
  let store
  const names = () => store.files.map((f) => f.name)

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useConverterStore()
    store.files = ['a', 'b', 'c'].map((name, i) => ({ id: i + 1, name, size: 1 }))
  })

  it('verschiebt innerhalb der Liste', () => {
    store.moveFile(0, 2)
    expect(names()).toEqual(['b', 'c', 'a'])
    store.moveFile(2, 0)
    expect(names()).toEqual(['a', 'b', 'c'])
  })

  it.each([
    [0, -1],
    [2, 3],
    [-1, 0],
    [3, 0],
  ])('ignoriert ungültige Indizes (%i → %i)', (from, to) => {
    store.moveFile(from, to)
    expect(names()).toEqual(['a', 'b', 'c'])
  })
})
