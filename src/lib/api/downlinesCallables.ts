import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import type { DownlineRow } from '@/types/models'

export async function listAllDownlines(): Promise<{ downlines: DownlineRow[] }> {
  const fn = getHttpsCallable('listAllDownlines')
  const res = await fn({})
  return res.data as { downlines: DownlineRow[] }
}
