import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'

const LINKS: { to: string; label: string; hint: string }[] = [
  {
    to: '/admin/reports/balance-adjustments',
    label: 'Balance adjustments',
    hint: 'Admin wallet deltas (audit).',
  },
  {
    to: '/admin/reports/income-daily-roi',
    label: 'Daily ROI credits',
    hint: 'Scheduled ROI credits per package.',
  },
  {
    to: '/admin/reports/income-sponsor',
    label: 'Direct referral income',
    hint: 'Sponsor bonus on downline activation.',
  },
  {
    to: '/admin/reports/income-team-level',
    label: 'Team level income',
    hint: 'Matrix share of downline ROI.',
  },
  {
    to: '/admin/reports/income-rank',
    label: 'Rank bonus payouts',
    hint: 'Rank reward schedule credits.',
  },
  {
    to: '/admin/reports/active-packages',
    label: 'Packages & ROI pause',
    hint: 'Package status and admin ROI pause.',
  },
  {
    to: '/admin/reports/peer-transfers',
    label: 'Member peer transfers',
    hint: 'Activation wallet transfers between members; export to Excel.',
  },
]

export function AdminIncomeLedgersHubPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Income ledgers</h1>
        <p className="text-sm text-zinc-500">
          Open a report below. On each page you can filter by <strong>local date range</strong> (optional member UID
          filter where applicable) and export the <strong>currently visible</strong> rows to Excel-compatible CSV.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="block no-underline">
            <Card className="h-full border-red-900/25 p-4 transition-colors hover:border-red-800/40 hover:bg-zinc-900/40">
              <p className="font-semibold text-zinc-100">{l.label}</p>
              <p className="mt-1 text-[12px] text-zinc-500">{l.hint}</p>
              <p className="mt-2 text-xs font-medium text-red-900/90">Open →</p>
            </Card>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
