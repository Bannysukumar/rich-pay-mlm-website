import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.internalTransfers,
  orderField: 'createdAt',
  orderDescWhenUnscoped: true,
  maxRows: 800,
  enableMemberUidFilter: true,
  memberUidClientFields: ['userId', 'recipientUid'],
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
  relatedUid: (_id, d) => String(d.recipientUid ?? ''),
  relatedLabel: 'Recipient',
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'member-peer-transfers',
  headers: [
    'Document ID',
    'Created (ISO UTC)',
    'From username',
    'From full name',
    'From UID',
    'Recipient username',
    'Recipient full name',
    'Recipient UID',
    'Amount USDT',
    'From wallet',
    'To wallet',
  ],
  buildRow: ({ id, data }, profiles) => {
    const fromUid = String(data.userId ?? '').trim()
    const toUid = String(data.recipientUid ?? '').trim()
    const from = fromUid ? profiles.get(fromUid) : undefined
    const to = toUid ? profiles.get(toUid) : undefined
    return [
      id,
      ledgerFormat.formatLedgerIso(data),
      from?.username ?? String(data.fromUsername ?? ''),
      from?.fullName ?? '',
      fromUid,
      to?.username ?? String(data.toUsername ?? ''),
      to?.fullName ?? '',
      toUid,
      Number(data.amount ?? 0),
      String(data.fromWallet ?? ''),
      String(data.toWallet ?? ''),
    ]
  },
}

export function AdminReportPeerTransfersPage() {
  return (
    <AdminLedgerReport
      title="Member peer transfers"
      description="Activation-wallet transfers between members (`internalTransfer`). Each row is one debit from the sender and credit to the recipient. Export matches the table after optional filters."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      exportConfig={EXPORT_CONFIG}
      columns={[
        { header: 'Time', cell: (_id, d) => ledgerFormat.formatLedgerTime(d) },
        { header: 'Amount (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 4) },
        {
          header: 'To UserID',
          cell: (_id, d) => {
            const v = String(
              d.toUsername ?? d.recipientUsername ?? d.toUserId ?? d.recipientUserId ?? '',
            ).trim()
            return v || '—'
          },
        },
        {
          header: 'Wallets',
          cell: (_id, d) =>
            `${String(d.fromWallet ?? '—')} → ${String(d.toWallet ?? '—')}`,
        },
      ]}
    />
  )
}
