import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'

/** Only list / export balance adjustments on or after 15 May 2026 (UTC midnight). */
const REPORT_MIN_CREATED_AT_MS = Date.UTC(2026, 4, 15, 0, 0, 0, 0)

/** Server writes `adminAdjustMemberBalances` on each adjust; client used to duplicate as `adminWalletAdjust`. */
const AUDIT_SOURCE = {
  kind: 'audit' as const,
  actions: ['adminAdjustMemberBalances'],
  maxRows: 450,
}

const TARGET_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => {
    const detail = (d.detail ?? {}) as Record<string, unknown>
    return String(detail.userId ?? '')
  },
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-balance-adjustments',
  headers: [
    'Audit document ID',
    'Created (ISO UTC)',
    'Action',
    'Actor UID',
    'Target username',
    'Target full name',
    'Target user UID',
    'Field',
    'Delta USDT',
  ],
  buildRow: ({ id, data }, profiles) => {
    const detail = (data.detail ?? {}) as Record<string, unknown>
    const targetUid = String(detail.userId ?? '').trim()
    const tp = targetUid ? profiles.get(targetUid) : undefined
    return [
      id,
      ledgerFormat.formatLedgerIso(data),
      String(data.action ?? ''),
      String(data.actorUid ?? ''),
      tp?.username ?? '',
      tp?.fullName ?? '',
      targetUid,
      String(detail.field ?? ''),
      Number(detail.delta ?? 0),
    ]
  },
}

export function AdminReportBalanceAdjustmentsPage() {
  return (
    <AdminLedgerReport
      title="Balance adjustments (USDT)"
      description="One row per admin balance change (server audit). Duplicate client-side logs are excluded. Only entries from 15 May 2026 (UTC) onward are shown and included in CSV export."
      source={AUDIT_SOURCE}
      memberProfiles={TARGET_PROFILES}
      exportConfig={EXPORT_CONFIG}
      minRowTimestampMs={REPORT_MIN_CREATED_AT_MS}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Action', cell: (_id, d) => String(d.action ?? '—') },
        { header: 'Actor', cell: (_id, d) => ledgerFormat.uidShort(d.actorUid) },
        {
          header: 'Field',
          cell: (_id, d) => {
            const detail = (d.detail ?? {}) as Record<string, unknown>
            return String(detail.field ?? '—')
          },
        },
        {
          header: 'Delta',
          cell: (_id, d) => {
            const detail = (d.detail ?? {}) as Record<string, unknown>
            return ledgerFormat.formatNum(detail.delta, 6)
          },
        },
      ]}
    />
  )
}
