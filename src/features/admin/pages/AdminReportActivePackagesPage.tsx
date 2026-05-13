import {
  AdminLedgerReport,
  ledgerFormat,
  type LedgerExportConfig,
  type LedgerMemberProfiles,
} from '@/features/admin/components/AdminLedgerReport'
import { COLLECTIONS } from '@/lib/constants'

const SOURCE = {
  kind: 'firestore' as const,
  collectionPath: COLLECTIONS.activePackages,
  orderField: 'startedAt',
  orderDescWhenUnscoped: true,
  maxRows: 400,
  enableMemberUidFilter: true,
}

const MEMBER_PROFILES: LedgerMemberProfiles = {
  primaryUid: (_id, d) => String(d.userId ?? ''),
}

const EXPORT_CONFIG: LedgerExportConfig = {
  filenameBase: 'income-active-packages-roi-pause',
  headers: [
    'Document ID',
    'Started (ISO UTC)',
    'Username',
    'Full name',
    'User UID',
    'Status',
    'ROI paused',
    'Stake USDT',
    'Plan name',
    'Plan type',
  ],
  buildRow: ({ id, data }, profiles) => {
    const uid = String(data.userId ?? '').trim()
    const p = uid ? profiles.get(uid) : undefined
    const ps = data.planSnapshot as Record<string, unknown> | undefined
    return [
      id,
      ledgerFormat.formatStartedIso(data),
      p?.username ?? '',
      p?.fullName ?? '',
      uid,
      String(data.status ?? ''),
      data.adminRoiPaused === true ? 'Yes' : 'No',
      Number(data.amount ?? 0),
      String(ps?.packageName ?? data.packageId ?? ''),
      String(data.planType ?? ps?.planType ?? ''),
    ]
  },
}

export function AdminReportActivePackagesPage() {
  return (
    <AdminLedgerReport
      title="Packages — status & ROI pause"
      description="Active investment rows: lifecycle status, stake, and whether admin ROI accrual is paused (see Member plans (ROI) to toggle)."
      source={SOURCE}
      memberProfiles={MEMBER_PROFILES}
      dateFilterField="startedAt"
      exportConfig={EXPORT_CONFIG}
      columns={[
        {
          header: 'Started',
          cell: (_id, d) => {
            const ms = Number(d.startedAt ?? 0)
            if (!ms) return '—'
            return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
          },
        },
        { header: 'Status', cell: (_id, d) => String(d.status ?? '—') },
        {
          header: 'ROI paused',
          cell: (_id, d) => (d.adminRoiPaused === true ? 'Yes' : 'No'),
        },
        { header: 'Stake (USDT)', cell: (_id, d) => ledgerFormat.formatNum(d.amount, 2) },
        {
          header: 'Plan',
          cell: (_id, d) => {
            const ps = d.planSnapshot as Record<string, unknown> | undefined
            return String(ps?.packageName ?? d.packageId ?? '—').slice(0, 32)
          },
        },
        {
          header: 'Plan type',
          cell: (_id, d) => {
            const ps = d.planSnapshot as Record<string, unknown> | undefined
            return String(d.planType ?? ps?.planType ?? '—')
          },
        },
      ]}
    />
  )
}
