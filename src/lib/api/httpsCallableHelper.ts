import { httpsCallable, httpsCallableFromURL } from 'firebase/functions'
import { functions } from '@/lib/firebase'

/**
 * Optional dev proxy: `/api/call/:name` → HTTP functions host (see `vite.config.ts`).
 *
 * **Default is off** so `httpsCallable(functions, name)` uses the same regional URL the Firebase
 * SDK expects (avoids 404s when the proxy target does not match your deployed Gen‑2 / Cloud Run URL).
 *
 * Turn **on** with `VITE_USE_FUNCTIONS_PROXY=true` when you need same-origin proxying (e.g. custom
 * invoker / `FUNCTIONS_PROXY_BEARER` / SA token for `registerWithProfile`). Optionally set
 * `FUNCTIONS_PROXY_ORIGIN` in `.env` so the proxy forwards to the correct base URL.
 *
 * Emulator: `VITE_USE_FUNCTIONS_EMULATOR=true` (run `firebase emulators:start` with functions).
 */
function useDevProxy(): boolean {
  if (!import.meta.env.DEV) return false
  if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') return false
  return import.meta.env.VITE_USE_FUNCTIONS_PROXY === 'true'
}

export function getHttpsCallable(name: string) {
  if (useDevProxy()) {
    return httpsCallableFromURL(functions, `${window.location.origin}/api/call/${name}`)
  }
  return httpsCallable(functions, name)
}
