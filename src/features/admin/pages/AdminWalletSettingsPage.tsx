import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import type { WithdrawPackageCapRow } from '@/types/models'

const DEFAULT_CAPS: WithdrawPackageCapRow[] = [
  { packageAmount: 100, maxWithdrawal: 20, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 10 },
  { packageAmount: 200, maxWithdrawal: 40, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 20 },
  { packageAmount: 300, maxWithdrawal: 60, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 30 },
  { packageAmount: 400, maxWithdrawal: 80, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 40 },
  { packageAmount: 500, maxWithdrawal: 100, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 50 },
]

function normalizeCaps(raw: unknown): WithdrawPackageCapRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_CAPS.map((r) => ({ ...r }))
  return raw.map((x) => {
    const row = x as Record<string, unknown>
    return {
      packageAmount: Number(row.packageAmount ?? 0),
      maxWithdrawal: Number(row.maxWithdrawal ?? 0),
      usePercentFormula: row.usePercentFormula === true,
      percentOfPackage: Number(row.percentOfPackage ?? 20),
      active: row.active !== false,
      sortOrder: Number(row.sortOrder ?? row.packageAmount ?? 0),
    }
  })
}

export function AdminWalletSettingsPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [minW, setMinW] = useState('10')
  const [fee, setFee] = useState('10')
  const [nwCap, setNwCap] = useState('2')
  const [wCap, setWCap] = useState('3')
  const [caps, setCaps] = useState<WithdrawPackageCapRow[]>(DEFAULT_CAPS.map((r) => ({ ...r })))
  const [withdrawNetwork, setWithdrawNetwork] = useState('USDT BEP-20')
  const [winStart, setWinStart] = useState('10:30')
  const [winEnd, setWinEnd] = useState('13:30')
  const [winTz, setWinTz] = useState('Etc/UTC')
  const [requireActivePkg, setRequireActivePkg] = useState(true)
  const [withdrawEnabled, setWithdrawEnabled] = useState(true)
  const [processingMode, setProcessingMode] = useState<'manual' | 'auto'>('manual')
  const [processingHours, setProcessingHours] = useState('48')
  const [defaultPct, setDefaultPct] = useState('20')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setMinW(String(Number(data.minWithdrawal ?? 10)))
    setFee(String(Number(data.withdrawFeePercent ?? 10)))
    setNwCap(String(Number(data.nonWorkingIncomeCapMultiplier ?? 2)))
    setWCap(String(Number(data.workingIncomeCapMultiplier ?? 3)))
    setCaps(normalizeCaps(data.withdrawPackageCaps))
    setWithdrawNetwork(String(data.withdrawNetworkLabel ?? data.depositNetwork ?? 'USDT BEP-20'))
    setWinStart(String(data.withdrawalWindowStart ?? '10:30'))
    setWinEnd(String(data.withdrawalWindowEnd ?? '13:30'))
    setWinTz(String(data.withdrawalWindowTimezone ?? 'Etc/UTC'))
    setRequireActivePkg(data.withdrawalRequiresActivePackage !== false)
    setWithdrawEnabled(data.withdrawalsEnabled !== false)
    setProcessingMode(data.withdrawalProcessingMode === 'auto' ? 'auto' : 'manual')
    setProcessingHours(String(Number(data.withdrawalProcessingIntervalHours ?? 48)))
    setDefaultPct(String(Number(data.defaultWithdrawalPercentOfPackage ?? 20)))
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save(
        {
          minWithdrawal: Number(minW),
          withdrawFeePercent: Number(fee),
          nonWorkingIncomeCapMultiplier: Number(nwCap || 2),
          workingIncomeCapMultiplier: Number(wCap || 3),
          withdrawNetworkLabel: withdrawNetwork.trim(),
          withdrawalWindowStart: winStart.trim(),
          withdrawalWindowEnd: winEnd.trim(),
          withdrawalWindowTimezone: winTz.trim(),
          withdrawalRequiresActivePackage: requireActivePkg,
          withdrawalsEnabled: withdrawEnabled,
          withdrawalProcessingMode: processingMode,
          withdrawalProcessingIntervalHours: Math.min(336, Math.max(1, Number(processingHours || 48))),
          defaultWithdrawalPercentOfPackage: Math.min(100, Math.max(0, Number(defaultPct || 20))),
          withdrawPackageCaps: caps.map((c) => ({ ...c })),
        },
        'adminWalletIncomeCaps',
        { bumpPlanVersion: true, bumpWithdrawPoliciesVersion: true },
      )
      toast.success('Wallet + withdrawal rails saved — plan snapshot metadata bumped')
    } catch {
      toast.error('Persist failed')
    } finally {
      setBusy(false)
    }
  }

  const seedWithdrawDefaults = async () => {
    if (!window.confirm('Insert default withdrawal limits & window metadata if missing (admin only)?')) return
    setBusy(true)
    try {
      const fn = getHttpsCallable('adminSeedCompensationDefaults')
      await fn({ seedTeamLevels: false, seedRanks: false, seedWithdrawDefaults: true })
      toast.success('Withdrawal defaults applied where empty')
    } catch {
      toast.error('Withdrawal seed failed')
    } finally {
      setBusy(false)
    }
  }

  const bumpRow = (i: number, patch: Partial<WithdrawPackageCapRow>) => {
    setCaps((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const insertCap = () => {
    const nextSort = caps.length ? Math.max(...caps.map((c) => c.sortOrder)) + 10 : 10
    setCaps((p) => [
      ...p,
      {
        packageAmount: 0,
        maxWithdrawal: 0,
        usePercentFormula: false,
        percentOfPackage: 20,
        active: true,
        sortOrder: nextSort,
      },
    ])
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Wallet &amp; withdrawal settings</h1>
        <p className="text-sm text-zinc-500">
          Mirrors <code className="text-zinc-600">siteSettings/config</code>. Changing caps/fees increments{' '}
          <code className="text-zinc-600">withdrawPoliciesVersion</code>; new package activations capture the latest freeze.
        </p>
        <Button type="button" variant="outline" className="mt-3 text-xs" disabled={busy} onClick={() => void seedWithdrawDefaults()}>
          Seed default withdrawal tiers ($100–$500 caps)
        </Button>
      </div>

      <Card className="grid max-w-4xl gap-4 border-red-900/25 p-6 md:grid-cols-2">
        <div>
          <Label>Minimum withdrawal (USDT)</Label>
          <Input value={minW} onChange={(e) => setMinW(e.target.value)} />
        </div>
        <div>
          <Label>Withdrawal convenience fee (%)</Label>
          <Input value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div>
          <Label>Withdrawal network label</Label>
          <Input value={withdrawNetwork} onChange={(e) => setWithdrawNetwork(e.target.value)} />
        </div>
        <div>
          <Label>Withdrawals globally enabled</Label>
          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="accent-red-600"
              checked={withdrawEnabled}
              onChange={(e) => setWithdrawEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>
        <div>
          <Label>Withdrawal window start (HH:mm)</Label>
          <Input value={winStart} onChange={(e) => setWinStart(e.target.value)} placeholder="10:30" />
        </div>
        <div>
          <Label>Withdrawal window end (HH:mm)</Label>
          <Input value={winEnd} onChange={(e) => setWinEnd(e.target.value)} placeholder="13:30" />
        </div>
        <div className="md:col-span-2">
          <Label>Timezone (IANA)</Label>
          <Input value={winTz} onChange={(e) => setWinTz(e.target.value)} placeholder="Etc/UTC" />
          <p className="mt-1 text-[10px] text-zinc-500">Member requests are validated inside this TZ.</p>
        </div>
        <div>
          <Label>Require active package</Label>
          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="accent-red-600"
              checked={requireActivePkg}
              onChange={(e) => setRequireActivePkg(e.target.checked)}
            />
            Must have ≥1 active package
          </label>
        </div>
        <div>
          <Label>Fallback max % if no tier row matches</Label>
          <Input value={defaultPct} onChange={(e) => setDefaultPct(e.target.value)} />
        </div>
        <div>
          <Label>Auto processing cadence target (hours)</Label>
          <Input value={processingHours} onChange={(e) => setProcessingHours(e.target.value)} />
        </div>
        <div>
          <Label>Processing mode</Label>
          <select
            className="mt-1 w-full rounded-xl border border-zinc-900 bg-black/55 px-3 py-2 text-xs text-zinc-200"
            value={processingMode}
            onChange={(e) => setProcessingMode(e.target.value as 'manual' | 'auto')}
          >
            <option value="manual">Manual admin</option>
            <option value="auto">Automated payout job</option>
          </select>
        </div>
        <div className="md:col-span-2 text-[11px] text-zinc-500">
          Automated mode uses <code className="text-zinc-600">processAutoWithdrawals</code> (checks every six hours whether the
          configured interval elapsed) to mark approved rows as paid with placeholder TX until you annotate on-chain hashes.
        </div>
      </Card>

      <Card className="space-y-3 border-red-900/25 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-100">Package-based withdrawal ceilings</h2>
          <Button type="button" variant="outline" className="text-[11px]" onClick={() => insertCap()}>
            Add tier
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Exact principal match selects the tier. Tick <strong>formula</strong> to use % of whatever the member&apos;s
          dominant active stake is instead of fixed USDT caps.
        </p>
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[11px] text-zinc-400">
            <thead className="border-b border-zinc-800 text-[10px] uppercase text-zinc-600">
              <tr>
                <th className="px-2 py-2">Pkg $</th>
                <th className="px-2 py-2">Fixed max</th>
                <th className="px-2 py-2">% formula</th>
                <th className="px-2 py-2">Pct</th>
                <th className="px-2 py-2">Sort</th>
                <th className="px-2 py-2">On</th>
              </tr>
            </thead>
            <tbody>
              {caps
                .map((row, origIdx) => ({ row, origIdx }))
                .sort((a, b) => a.row.sortOrder - b.row.sortOrder)
                .map(({ row, origIdx }) => (
                  <tr key={origIdx} className="border-b border-zinc-900/80">
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="h-8 text-[11px]"
                        value={row.packageAmount}
                        onChange={(e) => bumpRow(origIdx, { packageAmount: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="h-8 text-[11px]"
                        value={row.maxWithdrawal}
                        onChange={(e) => bumpRow(origIdx, { maxWithdrawal: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        className="accent-red-600"
                        checked={row.usePercentFormula}
                        onChange={(e) => bumpRow(origIdx, { usePercentFormula: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="h-8 text-[11px]"
                        value={row.percentOfPackage}
                        onChange={(e) => bumpRow(origIdx, { percentOfPackage: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="h-8 text-[11px]"
                        value={row.sortOrder}
                        onChange={(e) => bumpRow(origIdx, { sortOrder: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        className="accent-red-600"
                        checked={row.active}
                        onChange={(e) => bumpRow(origIdx, { active: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid max-w-xl gap-4 border-red-900/25 p-6 md:grid-cols-2">
        <div>
          <Label>Non-working ROI cap (× principal)</Label>
          <Input value={nwCap} onChange={(e) => setNwCap(e.target.value)} />
          <p className="text-[10px] text-zinc-500">Frozen on each activation; defaults to 2 (200%).</p>
        </div>
        <div>
          <Label>Working income cap (× activation)</Label>
          <Input value={wCap} onChange={(e) => setWCap(e.target.value)} />
          <p className="text-[10px] text-zinc-500">Caps sponsor + team pool per purchase.</p>
        </div>
        <Button
          type="button"
          variant="danger"
          disabled={busy || !ready}
          className="md:col-span-2"
          onClick={() => void persist()}
        >
          Save treasury settings
        </Button>
      </Card>
    </motion.div>
  )
}
