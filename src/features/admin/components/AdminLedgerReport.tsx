import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { downloadExcelCsv } from '@/lib/export/reportExport'
import { db } from '@/lib/firebase'

export type LedgerColumn = {
  header: string
  cell: (id: string, data: Record<string, unknown>) => ReactNode
}

/** When set, loads `users/{uid}` and splices identity columns after the first ledger column (e.g. Time). */
export type LedgerMemberProfiles = {
  primaryUid: (id: string, data: Record<string, unknown>) => string | null | undefined
  relatedUid?: (id: string, data: Record<string, unknown>) => string | null | undefined
  /** Prefix for related party headers (default `From`). */
  relatedLabel?: string
}

type ProfileLite = {
  username: string
  fullName: string
  email: string
  phone: string
}

export type LedgerExportProfile = ProfileLite

export type LedgerExportConfig = {
  /** Filename stem (`.csv` appended; safe for Excel). */
  filenameBase: string
  headers: string[]
  buildRow: (
    row: { id: string; data: Record<string, unknown> },
    profiles: Map<string, LedgerExportProfile>,
  ) => (string | number)[]
}

const PROFILE_CHUNK = 30

async function fetchUserProfilesLite(ids: string[]): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>()
  const unique = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < unique.length; i += PROFILE_CHUNK) {
    const part = unique.slice(i, i + PROFILE_CHUNK)
    try {
      const qs = query(collection(db, COLLECTIONS.users), where(documentId(), 'in', part))
      const snap = await getDocs(qs)
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        map.set(d.id, {
          username: String(x.username ?? ''),
          fullName: String(x.fullName ?? '').trim(),
          email: String(x.email ?? ''),
          phone: String(x.phone ?? ''),
        })
      })
    } catch {
      toast.error('Could not load some member profiles')
    }
  }
  return map
}

export function formatLedgerTime(data: Record<string, unknown>, field = 'createdAt') {
  const v = data[field]
  const ms =
    v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
      ? (v as { toMillis: () => number }).toMillis()
      : Number(v ?? 0)
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** ISO 8601 UTC for spreadsheets (Excel). */
export function formatLedgerIso(data: Record<string, unknown>, field = 'createdAt') {
  const v = data[field]
  const ms =
    v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
      ? (v as { toMillis: () => number }).toMillis()
      : Number(v ?? 0)
  return ms ? new Date(ms).toISOString() : ''
}

export function formatStartedIso(data: Record<string, unknown>) {
  const ms = Number(data.startedAt ?? 0)
  return ms ? new Date(ms).toISOString() : ''
}

/** Milliseconds for date-range filtering; null if missing / invalid. */
function ledgerRowTimestampMs(data: Record<string, unknown>, field: 'createdAt' | 'startedAt'): number | null {
  if (field === 'startedAt') {
    const n = Number(data.startedAt ?? 0)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const v = data.createdAt
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis()
  }
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : null
}

function localDayStartMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T00:00:00`).getTime()
  return Number.isNaN(t) ? null : t
}

function localDayEndMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T23:59:59.999`).getTime()
  return Number.isNaN(t) ? null : t
}

function formatNum(n: unknown, digits = 4) {
  const x = Number(n ?? 0)
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(digits)
}

export function uidShort(uid: unknown) {
  const s = String(uid ?? '').trim()
  if (!s) return '—'
  return s.length <= 10 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`
}

function dash(v: string) {
  return v || '—'
}

type FirestoreSource = {
  kind: 'firestore'
  collectionPath: string
  orderField: string
  /** Without member filter: desc shows newest first (single-field index). With member filter: uses asc + reverse to match existing composite indexes. */
  orderDescWhenUnscoped: boolean
  maxRows: number
  enableMemberUidFilter?: boolean
  /**
   * When `enableMemberUidFilter` is true and the admin enters a UID, the default is Firestore `where('userId','==', uid)`.
   * If this array is non-empty, instead loads the latest `maxRows` documents and keeps rows where **any** listed field
   * equals the trimmed filter (exact match). Use for ledgers with multiple parties (e.g. peer transfers).
   */
  memberUidClientFields?: string[]
}

type AuditSource = {
  kind: 'audit'
  /** Keep rows whose `action` is in this list */
  actions: string[]
  maxRows: number
}

type Props = {
  title: string
  description: string
  source: FirestoreSource | AuditSource
  columns: LedgerColumn[]
  /** Load Firestore profiles for these UIDs per row; columns appear after the first column. */
  memberProfiles?: LedgerMemberProfiles
  /** Export current table rows to a UTF-8 CSV that opens in Excel. */
  exportConfig?: LedgerExportConfig
  /** Field used for optional date range filter (default `createdAt`). Use `startedAt` for package rows. */
  dateFilterField?: 'createdAt' | 'startedAt'
  /** Replaces default helper text under the member UID filter (Firestore sources). */
  memberFilterHelpText?: string
  /**
   * When set, rows with a timestamp before this instant (see `dateFilterField`) are hidden
   * and excluded from export — applied after load, before the optional local date range.
   */
  minRowTimestampMs?: number
}

export function AdminLedgerReport({
  title,
  description,
  source,
  columns,
  memberProfiles,
  exportConfig,
  dateFilterField = 'createdAt',
  memberFilterHelpText,
  minRowTimestampMs,
}: Props) {
  const [memberUid, setMemberUid] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rows, setRows] = useState<{ id: string; data: Record<string, unknown> }[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map())

  const memberTrim = memberUid.trim()

  const refreshProfiles = useCallback(
    async (list: { id: string; data: Record<string, unknown> }[]) => {
      if (!memberProfiles) return
      if (list.length === 0) {
        setProfiles(new Map())
        return
      }
      const ids = new Set<string>()
      for (const r of list) {
        const a = memberProfiles.primaryUid(r.id, r.data)?.trim()
        if (a) ids.add(a)
        const b = memberProfiles.relatedUid?.(r.id, r.data)?.trim()
        if (b) ids.add(b)
      }
      const m = await fetchUserProfilesLite([...ids])
      setProfiles(m)
    },
    [memberProfiles],
  )

  useEffect(() => {
    if (source.kind === 'audit') {
      const qRef = query(
        collection(db, COLLECTIONS.auditLogs),
        orderBy('createdAt', 'desc'),
        limit(source.maxRows),
      )
      return onSnapshot(
        qRef,
        (snap) => {
          const allow = new Set(source.actions)
          let list = snap.docs
            .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
            .filter((r) => allow.has(String(r.data.action ?? '')))
          if (memberTrim) {
            const key = memberTrim.toLowerCase()
            list = list.filter((r) => {
              const actor = String(r.data.actorUid ?? '').toLowerCase()
              const detail = (r.data.detail ?? {}) as Record<string, unknown>
              const target = String(detail.userId ?? '').toLowerCase()
              return actor.includes(key) || target.includes(key) || key === r.id.toLowerCase()
            })
          }
          setRows(list)
          void refreshProfiles(list)
        },
        () => {
          toast.error('Could not load audit rows')
          setRows([])
        },
      )
    }

    const s = source
    const constraints: QueryConstraint[] = []
    const clientMemberFields =
      Array.isArray(s.memberUidClientFields) && s.memberUidClientFields.length > 0
        ? s.memberUidClientFields
        : null
    const useClientMemberFilter = Boolean(
      memberTrim && s.enableMemberUidFilter && clientMemberFields && clientMemberFields.length > 0,
    )

    if (memberTrim && s.enableMemberUidFilter && !useClientMemberFilter) {
      constraints.push(where('userId', '==', memberTrim))
      constraints.push(orderBy(s.orderField, 'asc'))
    } else {
      constraints.push(orderBy(s.orderField, s.orderDescWhenUnscoped ? 'desc' : 'asc'))
    }
    constraints.push(limit(s.maxRows))
    const qRef = query(collection(db, s.collectionPath), ...constraints)
    return onSnapshot(
      qRef,
      (snap) => {
        let list = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        if (memberTrim && s.enableMemberUidFilter && !useClientMemberFilter) {
          list = [...list].reverse()
        }
        if (useClientMemberFilter && clientMemberFields) {
          const key = memberTrim
          list = list.filter((r) =>
            clientMemberFields.some((f) => String(r.data[f] ?? '').trim() === key),
          )
        }
        setRows(list)
        void refreshProfiles(list)
      },
      () => {
        toast.error('Could not load ledger')
        setRows([])
      },
    )
  }, [source, memberTrim, refreshProfiles])

  const memberFilterActive =
    source.kind === 'audit' || (source.kind === 'firestore' && Boolean(source.enableMemberUidFilter))

  const displayRows = useMemo(() => {
    const fromMs = localDayStartMs(dateFrom)
    const toMs = localDayEndMs(dateTo)
    const lowerCandidates = [minRowTimestampMs, fromMs].filter(
      (v): v is number => v != null && Number.isFinite(v),
    )
    const lowerBound = lowerCandidates.length > 0 ? Math.max(...lowerCandidates) : null
    const hasAnyBound = lowerBound != null || toMs != null
    if (!hasAnyBound) return rows

    return rows.filter((r) => {
      const ms = ledgerRowTimestampMs(r.data, dateFilterField)
      if (ms == null) return false
      if (lowerBound != null && ms < lowerBound) return false
      if (toMs != null && ms > toMs) return false
      return true
    })
  }, [rows, dateFrom, dateTo, dateFilterField, minRowTimestampMs])

  const footerNote = useMemo(() => {
    const dateHint =
      ' Filter by local date range (optional); table and CSV export use the filtered rows.'
    const exportHint = exportConfig
      ? ' Use Export to Excel (CSV) for the rows currently shown (UTF-8; opens in Microsoft Excel).'
      : ''
    const minHint =
      minRowTimestampMs != null && Number.isFinite(minRowTimestampMs)
        ? ` Rows before ${new Date(minRowTimestampMs).toISOString().slice(0, 10)} (UTC) are hidden and omitted from export.`
        : ''
    if (source.kind === 'audit') {
      return `Up to ${source.maxRows} newest audit rows loaded; balance rows are filtered by action. Use filter to narrow by actor or target user UID.${minHint}${dateHint}${exportHint}`
    }
    const memberHint =
      source.kind === 'firestore' &&
      source.enableMemberUidFilter &&
      source.memberUidClientFields &&
      source.memberUidClientFields.length > 0
        ? ' Optional member filter matches sender or recipient UID within loaded rows.'
        : source.enableMemberUidFilter
          ? ' Optional member filter uses Firestore userId equality.'
          : ''
    return `Up to ${source.maxRows} documents.${memberHint}${minHint}${dateHint}${exportHint}`
  }, [source, exportConfig, minRowTimestampMs])

  const displayColumns = useMemo((): LedgerColumn[] => {
    if (!memberProfiles || columns.length === 0) return columns
    const first = columns[0]
    const rest = columns.slice(1)
    const rel = memberProfiles.relatedLabel?.trim() || 'From'
    const { primaryUid, relatedUid } = memberProfiles

    const primaryBlock: LedgerColumn[] = [
      first,
      {
        header: 'Username',
        cell: (id, data) => {
          const u = String(primaryUid(id, data) ?? '').trim()
          const p = u ? profiles.get(u) : undefined
          return (
            <span className="max-w-[120px] truncate font-mono text-zinc-300" title={p?.username || u || undefined}>
              {u ? dash(p?.username ?? '') : '—'}
            </span>
          )
        },
      },
      {
        header: 'Full name',
        cell: (id, data) => {
          const u = String(primaryUid(id, data) ?? '').trim()
          const p = u ? profiles.get(u) : undefined
          return (
            <span className="max-w-[140px] truncate text-zinc-300" title={p?.fullName || undefined}>
              {u ? dash(p?.fullName ?? '') : '—'}
            </span>
          )
        },
      },
      {
        header: 'User UID',
        cell: (id, data) => {
          const u = String(primaryUid(id, data) ?? '').trim()
          return (
            <span className="max-w-[200px] truncate font-mono text-[10px] text-zinc-500" title={u || undefined}>
              {u || '—'}
            </span>
          )
        },
      },
    ]

    if (!relatedUid) {
      return [...primaryBlock, ...rest]
    }

    const relatedBlock: LedgerColumn[] = [
      {
        header: `${rel} username`,
        cell: (id, data) => {
          const u = String(relatedUid(id, data) ?? '').trim()
          const p = u ? profiles.get(u) : undefined
          return (
            <span className="max-w-[120px] truncate font-mono text-zinc-300" title={p?.username || u || undefined}>
              {u ? dash(p?.username ?? '') : '—'}
            </span>
          )
        },
      },
      {
        header: `${rel} full name`,
        cell: (id, data) => {
          const u = String(relatedUid(id, data) ?? '').trim()
          const p = u ? profiles.get(u) : undefined
          return (
            <span className="max-w-[140px] truncate text-zinc-300" title={p?.fullName || undefined}>
              {u ? dash(p?.fullName ?? '') : '—'}
            </span>
          )
        },
      },
      {
        header: `${rel} user UID`,
        cell: (id, data) => {
          const u = String(relatedUid(id, data) ?? '').trim()
          return (
            <span className="max-w-[200px] truncate font-mono text-[10px] text-zinc-500" title={u || undefined}>
              {u || '—'}
            </span>
          )
        },
      },
    ]

    return [...primaryBlock, ...relatedBlock, ...rest]
  }, [columns, memberProfiles, profiles])

  const onExportExcel = useCallback(async () => {
    if (!exportConfig) return
    if (displayRows.length === 0) {
      toast.error('Nothing to export')
      return
    }
    try {
      const dataRows = displayRows.map((r) => exportConfig.buildRow(r, profiles))
      downloadExcelCsv(exportConfig.filenameBase, exportConfig.headers, dataRows)
      await pushAuditLog('adminExportIncomeLedger', {
        report: exportConfig.filenameBase,
        rows: dataRows.length,
      })
      toast.success(`Downloaded ${dataRows.length} rows — open the CSV in Excel`)
    } catch {
      toast.error('Export failed')
    }
  }, [exportConfig, displayRows, profiles])

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        {exportConfig ? (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 self-start"
            disabled={displayRows.length === 0}
            onClick={() => void onExportExcel()}
          >
            Export to Excel (CSV)
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        {memberFilterActive && (
          <Card className="space-y-2 border-red-900/25 p-4 lg:min-w-[280px] lg:max-w-md lg:flex-1">
            <Label>Filter by member Auth UID (optional)</Label>
            <Input
              value={memberUid}
              onChange={(e) => setMemberUid(e.target.value)}
              placeholder="Exact Firebase uid…"
              autoComplete="off"
            />
            <p className="text-[11px] text-zinc-600">
              {memberFilterHelpText ??
                (source.kind === 'audit'
                  ? 'Matches target userId inside adjustment detail, row id, or actor UID substring.'
                  : source.kind === 'firestore' &&
                      source.enableMemberUidFilter &&
                      source.memberUidClientFields &&
                      source.memberUidClientFields.length > 0
                    ? 'Exact Firebase Auth UID: keeps rows where the sender (userId) or recipient (recipientUid) matches, within the loaded window.'
                    : 'Restricts the query to documents where userId equals this value.')}
            </p>
          </Card>
        )}

        <Card className="space-y-3 border-red-900/25 p-4 lg:min-w-[300px] lg:max-w-lg lg:flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Date range (local)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
              }}
            >
              Clear dates
            </Button>
            <span className="text-[11px] text-zinc-600">
              {dateFilterField === 'startedAt'
                ? 'Uses package start time (`startedAt`).'
                : 'Uses document `createdAt`.'}{' '}
              Showing {displayRows.length} of {rows.length} loaded rows.
            </span>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto border-red-900/25 p-0">
        <table className="w-full min-w-[1100px] text-[11px]">
          <thead className="bg-red-950/30 text-[10px] uppercase text-red-950/85">
            <tr>
              {displayColumns.map((c, i) => (
                <th key={`${c.header}-${i}`} className="px-3 py-2 text-left text-zinc-500">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} className="px-3 py-8 text-center text-zinc-600">
                  No rows match the current filter.
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} className="px-3 py-8 text-center text-zinc-600">
                  No rows in this date range — adjust or clear the dates above.
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-900">
                  {displayColumns.map((c, i) => (
                    <td key={`${c.header}-${i}-${r.id}`} className="px-3 py-2 align-top text-zinc-400">
                      {c.cell(r.id, r.data)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-zinc-600">{footerNote}</p>
    </motion.div>
  )
}

/** Re-export helpers for page-level column builders */
export const ledgerFormat = { formatLedgerTime, formatLedgerIso, formatStartedIso, formatNum, uidShort }
