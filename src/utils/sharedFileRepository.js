/**
 * Shared File Repository – IndexedDB bridge between KodiniTools apps.
 *
 * Normalizer writes normalised audio blobs here; receiving tools
 * read from the same store when opened with ?source=audionormalizer.
 * Audiokonverter uses the same store with ?source=audiokonverter.
 * The Playliste-Konverter writes its finished playlist here for the
 * Ultimativer Musikplayer (?source=playlistkonverter).
 */

const DB_NAME = 'kodinitools-shared-files'
const STORE_NAME = 'audio-files'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getSharedFiles() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const request = tx.objectStore(STORE_NAME).getAll()

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close()
      resolve(request.result)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

export async function clearSharedFiles() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

/**
 * Replace the store's contents with the given files in one transaction,
 * so the receiving tool only picks up what was handed over just now.
 * @param {{ blob: Blob, name: string, mimeType?: string }[]} records
 */
export async function replaceSharedFiles(records) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  store.clear()
  for (const { blob, name, mimeType } of records) {
    store.add({ blob, name, mimeType: mimeType || blob.type, createdAt: Date.now() })
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}
