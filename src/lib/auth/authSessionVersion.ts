const PREFIX = 'richpay.authSessionVersion.'

export function getLocalAuthSessionVersion(uid: string): number | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + uid)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setLocalAuthSessionVersion(uid: string, version: number): void {
  try {
    sessionStorage.setItem(PREFIX + uid, String(version))
  } catch {
    /* private browsing / quota */
  }
}

export function clearLocalAuthSessionVersion(uid: string): void {
  try {
    sessionStorage.removeItem(PREFIX + uid)
  } catch {
    /* ignore */
  }
}

export function clearAllLocalAuthSessionVersions(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}
