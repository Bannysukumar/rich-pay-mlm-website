import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth, initializeAuth, indexedDBLocalPersistence } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage } from 'firebase/storage'
import type { Analytics } from 'firebase/analytics'

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(measurementId ? { measurementId } : {}),
}

const app = initializeApp(firebaseConfig)

/** Prefer IndexedDB persistence so sessions survive closing the browser after “stay signed in”. */
function getOrInitAuth() {
  if (typeof window === 'undefined') {
    return getAuth(app)
  }
  try {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    })
  } catch {
    return getAuth(app)
  }
}

export const auth = getOrInitAuth()

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

export const storage = getStorage(app)

const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
export const functions = getFunctions(app, region)

if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

/** Analytics only runs in the browser when GA is supported (skips SSR / unsupported envs). */
export let analytics: Analytics | null = null
if (typeof window !== 'undefined' && measurementId) {
  void isSupported().then((ok) => {
    if (ok) analytics = getAnalytics(app)
  })
}

export { app }
