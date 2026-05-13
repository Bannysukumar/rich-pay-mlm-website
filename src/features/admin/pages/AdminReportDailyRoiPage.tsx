import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.dailyProfits,
  orderField: 'createdAt',
  orderDescWhenUnscoped: true,
  maxRows: 350,
  enableMemberUidFilter: true,
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-daily-roi',
  headers: [
    'Document ID',
    'Created (ISO UTC)',
    'Username',
    'Full name',
    'User UID',
    'Amount USDT',
    'Active package ID',
  ],
  buildRow: ({ id, data }, profiles) => {
    const uid = String(data.userId ?? '').trim()
    const p = uid ? profiles.get(uid) : undefined
    return [
      id,
      ledgerFormat.formatLedgerIso(data),
      p?.username ?? '',
      p?.fullName ?? '',
      uid,
      Number(data.amount ?? 0),
      String(data.activePackageId ?? ''),
    ]
  },
}

export function AdminReportDailyRoiPage() {
  return (
    <AdminLedgerReport
      title="Daily ROI credits"
      description="Non-working income credited by the scheduled ROI job (per active package). Same data members see under Daily profits."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      exportConfig={EXPORT_CONFIG}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Amount (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 4) },
        {
          header: 'Active package',
          cell: (_id, d) => ledgerFormat.uidShort(d.activePackageId),
        },
      ]}
    />
  )
}
