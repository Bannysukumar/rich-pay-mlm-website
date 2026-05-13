import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.sponsorBonuses,
  orderField: 'createdAt',
  orderDescWhenUnscoped: true,
  maxRows: 350,
  enableMemberUidFilter: true,
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
  relatedUid: (_id, d) => String(d.fromUserId ?? ''),
  relatedLabel: 'Downline',
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-direct-referral-sponsor',
  headers: [
    'Document ID',
    'Created (ISO UTC)',
    'Sponsor username',
    'Sponsor full name',
    'Sponsor UID',
    'Downline username',
    'Downline full name',
    'Downline UID',
    'Amount USDT',
    'Active package ID',
  ],
  buildRow: ({ id, data }, profiles) => {
    const sUid = String(data.userId ?? '').trim()
    const dUid = String(data.fromUserId ?? '').trim()
    const sp = sUid ? profiles.get(sUid) : undefined
    const dp = dUid ? profiles.get(dUid) : undefined
    return [
      id,
      ledgerFormat.formatLedgerIso(data),
      sp?.username ?? '',
      sp?.fullName ?? '',
      sUid,
      dp?.username ?? '',
      dp?.fullName ?? '',
      dUid,
      Number(data.amount ?? 0),
      String(data.activePackageId ?? ''),
    ]
  },
}

export function AdminReportSponsorBonusPage() {
  return (
    <AdminLedgerReport
      title="Direct referral income (sponsor bonus)"
      description="One-time working-income bonus paid to a sponsor when a direct downline activates a package."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      exportConfig={EXPORT_CONFIG}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Amount (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 4) },
        { header: 'Package ref', cell: (_id, d) => ledgerFormat.uidShort(d.activePackageId) },
      ]}
    />
  )
}
