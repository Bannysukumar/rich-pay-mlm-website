import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import {
  DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT,
  DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT,
  formatPackageTopupSplitLabel,
  splitTopupWalletDebit,
} from '@/lib/finance/splitTopupWallet'

const EXAMPLE_AMOUNT = 500

export function AdminPackageActivationSplitPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [activationPct, setActivationPct] = useState(String(DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT))
  const [depositPct, setDepositPct] = useState(String(DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setActivationPct(String(Number(data.packageTopupActivationPercent ?? DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT)))
    setDepositPct(String(Number(data.packageTopupDepositPercent ?? DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT)))
  }, [data, ready])

  const actNum = Number(activationPct)
  const depNum = Number(depositPct)
  const sumValid = Number.isFinite(actNum) && Number.isFinite(depNum) && Math.abs(actNum + depNum - 100) < 0.001
  const rangeValid =
    Number.isFinite(actNum) &&
    Number.isFinite(depNum) &&
    actNum >= 0 &&
    actNum <= 100 &&
    depNum >= 0 &&
    depNum <= 100

  const preview = useMemo(() => {
    if (!sumValid || !rangeValid) return null
    return splitTopupWalletDebit(EXAMPLE_AMOUNT, actNum, depNum)
  }, [actNum, depNum, sumValid, rangeValid])

  const syncDepositFromActivation = (raw: string) => {
    setActivationPct(raw)
    const n = Number(raw)
    if (Number.isFinite(n)) setDepositPct(String(Math.max(0, Math.min(100, 100 - n))))
  }

  const syncActivationFromDeposit = (raw: string) => {
    setDepositPct(raw)
    const n = Number(raw)
    if (Number.isFinite(n)) setActivationPct(String(Math.max(0, Math.min(100, 100 - n))))
  }

  const persist = async () => {
    if (!rangeValid) {
      toast.error('Each percentage must be between 0 and 100')
      return
    }
    if (!sumValid) {
      toast.error('Activation % + Deposit % must equal 100')
      return
    }
    setBusy(true)
    try {
      await save(
        {
          packageTopupActivationPercent: actNum,
          packageTopupDepositPercent: depNum,
        },
        'adminPackageTopupSplit',
      )
      toast.success('Package activation split saved')
    } catch {
      toast.error('Save failed')
    } finally {
      setBusy(false)
    }
  }

  const resetDefaults = () => {
    setActivationPct(String(DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT))
    setDepositPct(String(DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT))
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Package activation split</h1>
        <p className="mt-1 text-sm text-zinc-500">
          When a member activates or top-ups a package, the total amount is debited from{' '}
          <strong className="text-zinc-300">Activation wallet</strong> and{' '}
          <strong className="text-zinc-300">Deposit wallet</strong> using these percentages. Cash wallet is never used.
          Enforced in <code className="text-zinc-400">activatePackage</code>.
        </p>
      </div>

      <Card className="max-w-xl space-y-5 border-red-900/25 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Activation wallet %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className="mt-1"
              value={activationPct}
              onChange={(e) => syncDepositFromActivation(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">Taken from member Activation wallet</p>
          </div>
          <div>
            <Label>Deposit wallet %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className="mt-1"
              value={depositPct}
              onChange={(e) => syncActivationFromDeposit(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">Taken from member Deposit wallet</p>
          </div>
        </div>

        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            sumValid && rangeValid
              ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-100'
              : 'border-amber-900/40 bg-amber-950/20 text-amber-100'
          }`}
        >
          Total:{' '}
          <strong>
            {Number.isFinite(actNum) && Number.isFinite(depNum) ? (actNum + depNum).toFixed(2) : '—'}%
          </strong>
          {sumValid && rangeValid ? (
            <span className="ms-2">— valid split ({formatPackageTopupSplitLabel(actNum, depNum)})</span>
          ) : (
            <span className="ms-2">— must total exactly 100%</span>
          )}
        </div>

        {preview ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
            <p className="mb-2 font-medium text-zinc-100">Example: ${EXAMPLE_AMOUNT} package</p>
            <ul className="mb-0 space-y-1">
              <li>
                Activation wallet debit: <strong className="text-[#d4af37]">${preview.activation.toFixed(2)}</strong>{' '}
                ({actNum}%)
              </li>
              <li>
                Deposit wallet debit: <strong className="text-[#d4af37]">${preview.deposit.toFixed(2)}</strong> ({depNum}
                %)
              </li>
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="danger" disabled={busy || !ready || !sumValid || !rangeValid} onClick={() => void persist()}>
            Save split
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={resetDefaults}>
            Reset to 50 / 50
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}
