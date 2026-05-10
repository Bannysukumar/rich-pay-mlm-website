import { httpsCallable, httpsCallableFromURL } from 'firebase/functions'
import { functions } from '@/lib/firebase'

/**
 * Same-origin callable URL (no cross-origin browser request → avoids CORS on custom domains).
 *
 * - **Non-loopback hosts (production, preview, richpay.live):** always
 *   `${origin}/api/call/:name}` (Hosting rewrites or Vite preview middleware).
 * - **localhost / 127.0.0.1:** use the Vite proxy when `VITE_USE_FUNCTIONS_PROXY=true`;
 *   otherwise call regional `cloudfunctions.net` directly (see `vite.config.ts`).
 *
 * Set `VITE_FUNCTIONS_SAME_ORIGIN=false` to force the default regional `cloudfunctions.net` URL
 * (only if you have fixed CORS / invoker for that origin).
 *
 * Emulator: `VITE_USE_FUNCTIONS_EMULATOR=true` (uses emulator, not this path).
 */
function useSameOriginCallableUrl(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') return false
  if (import.meta.env.VITE_FUNCTIONS_SAME_ORIGIN === 'false') return false

  const host = window.location.hostname
  const isLoopback = host === 'localhost' || host === '127.0.0.1'

  // Only on loopback without the Vite proxy do we hit regional cloudfunctions.net.
  // Production sites must never rely on DEV flags: some builds ship with MODE=development
  // on a real domain, which wrongly skipped same-origin before.
  if (isLoopback) {
    return import.meta.env.VITE_USE_FUNCTIONS_PROXY === 'true'
  }

  return true
}

export function getHttpsCallable(name: string) {
  if (useSameOriginCallableUrl()) {
    return httpsCallableFromURL(functions, `${window.location.origin}/api/call/${name}`)
  }
  return httpsCallable(functions, name)
}
