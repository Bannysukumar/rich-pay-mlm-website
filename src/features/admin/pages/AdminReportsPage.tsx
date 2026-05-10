import { collection, getDocs, limit, query } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { exportRowsPdf, toCsv } from '@/lib/export/reportExport'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function AdminReportsPage() {
  const [busy, setBusy] = useState<'none' | 'deposit' | 'withdraw' | 'user'>('none')

  const csvDeposits = async () => {
    setBusy('deposit')
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.deposits), limit(900)))
      const rows: (string | number)[][] = []
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        const ts = x.createdAt as { toMillis?: () => number } | undefined
        const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(x.createdAt ?? 0)
        rows.push([d.id, String(x.userId ?? ''), String(x.status ?? ''), Number(x.amount ?? 0), ms])
      })
      const csv = toCsv(['id', 'userId', 'status', 'amount', 'createdMs'], rows)
      downloadCsv('deposits.csv', csv)
      await pushAuditLog('adminExportDeposits', { rows: rows.length })
      toast.success(`${rows.length} deposit rows mirrored locally`)
      exportRowsPdf('deposits-summary.pdf', 'Deposits', ['id', 'status', 'amount'], rows.slice(0, 40).map((r) => [String(r[0]), String(r[2]), String(r[3])]))
    } catch {
      toast.error('Exporter interrupted')
    } finally {
      setBusy('none')
    }
  }

  const csvWithdrawals = async () => {
    setBusy('withdraw')
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.withdrawals), limit(900)))
      const rows: (string | number)[][] = []
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        const ts = x.createdAt as { toMillis?: () => number } | undefined
        const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(x.createdAt ?? 0)
        rows.push([
          d.id,
          String(x.userId ?? ''),
          String(x.status ?? ''),
          Number(x.amountGross ?? x.amount ?? 0),
          String(x.txId ?? ''),
          ms,
        ])
      })
      downloadCsv('withdrawals.csv', toCsv(['id', 'userId', 'status', 'amountGross', 'txId', 'createdMs'], rows))
      await pushAuditLog('adminExportWithdrawals', { rows: rows.length })
      toast.success('Withdraw ledger exported')
    } catch {
      toast.error('Withdraw export failed')
    } finally {
      setBusy('none')
    }
  }

  const csvUsers = async () => {
    setBusy('user')
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.users), limit(800)))
      const rows: (string | number)[][] = []
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        rows.push([
          d.id,
          String(x.username ?? ''),
          String(x.fullName ?? ''),
          String(x.email ?? ''),
          String(x.role ?? 'user'),
          Number(x.createdAt ?? 0),
        ])
      })
      downloadCsv('users.csv', toCsv(['uid', 'username', 'fullName', 'email', 'role', 'createdAt'], rows))
      await pushAuditLog('adminExportUsers', { rows: rows.length })
      toast.success('User snapshot synthesized')
    } catch {
      toast.error('Unable to hydrate roster export')
    } finally {
      setBusy('none')
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Reports & Exports</h1>
        <p className="text-sm text-zinc-500">
          Streams up to ~900 freshest documents per cohort (Firestore read pricing applies).
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-3 border-red-900/25 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-red-950/85">Liquidity intake</p>
          <Button type="button" variant="danger" disabled={busy !== 'none'} onClick={() => void csvDeposits()}>
            CSV + PDF synopsis
          </Button>
          <p className="text-[11px] text-zinc-600">Bundles deposit proof metadata for reconciliation.</p>
        </Card>
        <Card className="space-y-3 border-red-900/25 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-red-950/85">Payout telemetry</p>
          <Button type="button" variant="outline" disabled={busy !== 'none'} onClick={() => void csvWithdrawals()}>
            Export withdrawals CSV
          </Button>
        </Card>
        <Card className="space-y-3 border-red-900/25 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-red-950/85">Network graph</p>
          <Button type="button" variant="outline" disabled={busy !== 'none'} onClick={() => void csvUsers()}>
            Export members CSV
          </Button>
        </Card>
      </div>
      {busy !== 'none' && <p className="text-xs text-red-700">Export engine running ({busy})…</p>}
    </motion.div>
  )
}
