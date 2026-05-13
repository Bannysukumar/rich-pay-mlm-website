import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.teamLevelBonuses,
  orderField: 'createdAt',
  orderDescWhenUnscoped: true,
  maxRows: 400,
  enableMemberUidFilter: true,
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
  relatedUid: (_id, d) => String(d.fromUserId ?? ''),
  relatedLabel: 'Downline',
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-team-level',
  headers: [
    'Document ID',
    'Created (ISO UTC)',
    'Upline username',
    'Upline full name',
    'Upline UID',
    'Downline username',
    'Downline full name',
    'Downline UID',
    'Level',
    'Amount USDT',
    'Source daily ROI USDT',
    'Note',
  ],
  buildRow: ({ id, data }, profiles) => {
    const uUid = String(data.userId ?? '').trim()
    const dUid = String(data.fromUserId ?? '').trim()
    const up = uUid ? profiles.get(uUid) : undefined
    const dp = dUid ? profiles.get(dUid) : undefined
    const note = String(data.distribution ?? data.conditionDescription ?? '')
    return [
      id,
      ledgerFormat.formatLedgerIso(data),
      up?.username ?? '',
      up?.fullName ?? '',
      uUid,
      dp?.username ?? '',
      dp?.fullName ?? '',
      dUid,
      String(data.level ?? ''),
      Number(data.amount ?? 0),
      Number(data.sourceDailyRoi ?? 0),
      note,
    ]
  },
}

export function AdminReportTeamLevelIncomePage() {
  return (
    <AdminLedgerReport
      title="Team level income"
      description="Working income from the team-level matrix, paid as a share of downline daily ROI when depth rules qualify."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      exportConfig={EXPORT_CONFIG}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Level', cell: (_id, d) => String(d.level ?? '—') },
        { header: 'Amount (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 4) },
        {
          header: 'Source ROI (USDT)',
          cell: (_id, d) => ledgerFormat.formatNum(d.sourceDailyRoi, 4),
        },
        {
          header: 'Note',
          cell: (_id, d) => String(d.distribution ?? d.conditionDescription ?? '—').slice(0, 48),
        },
      ]}
    />
  )
}
