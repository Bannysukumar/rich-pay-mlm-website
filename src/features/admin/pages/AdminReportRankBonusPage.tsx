import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.rankBonuses,
  orderField: 'createdAt',
  orderDescWhenUnscoped: true,
  maxRows: 350,
  enableMemberUidFilter: true,
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-rank-bonus',
  headers: [
    'Document ID',
    'Created (ISO UTC)',
    'Username',
    'Full name',
    'User UID',
    'Rank',
    'Amount USDT',
    'Day key',
    'Payout day',
    'Payout days total',
    'Transaction type',
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
      String(data.rankName ?? data.rankId ?? ''),
      Number(data.amount ?? 0),
      String(data.dayKey ?? ''),
      Number(data.payoutSequenceDay ?? 0),
      Number(data.payoutDaysTotal ?? 0),
      String(data.transactionType ?? ''),
    ]
  },
}

export function AdminReportRankBonusPage() {
  return (
    <AdminLedgerReport
      title="Rank bonus payouts"
      description="Scheduled rank compensation credits written by the rank reward job."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      exportConfig={EXPORT_CONFIG}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Rank', cell: (_id, d) => String(d.rankName ?? d.rankId ?? '—') },
        { header: 'Amount (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 4) },
        { header: 'Day', cell: (_id, d) => String(d.dayKey ?? '—') },
        {
          header: 'Seq',
          cell: (_id, d) =>
            `${Number(d.payoutSequenceDay ?? 0)}/${Number(d.payoutDaysTotal ?? 0) || '—'}`,
        },
        { header: 'Type', cell: (_id, d) => String(d.transactionType ?? '—').slice(0, 24) },
      ]}
    />
  )
}
