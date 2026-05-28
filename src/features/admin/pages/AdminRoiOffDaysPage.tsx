import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import {
  istDayKey,
  istWeekdayLong,
  isSundayIst,
  normalizeRoiOffDates,
  ROI_CALENDAR_TZ,
  shouldSkipDailyRoiAndTeamLevel,
} from '@/lib/istCalendar'

function formatOffDateLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const pretty = new Intl.DateTimeFormat('en-IN', {
    timeZone: ROI_CALENDAR_TZ,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dt)
  return pretty
}

export function AdminRoiOffDaysPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [offDates, setOffDates] = useState<string[]>([])
  const [pickDate, setPickDate] = useState('')
  const [busy, setBusy] = useState(false)

  const todayKey = useMemo(() => istDayKey(), [])
  const todayWeekday = useMemo(() => istWeekdayLong(), [])

  useEffect(() => {
    if (!ready) return
    setOffDates(normalizeRoiOffDates(data.roiOffDates))
    if (!pickDate) setPickDate(todayKey)
  }, [data, ready, todayKey, pickDate])

  const todayOff = offDates.includes(todayKey)
  const skipToday = shouldSkipDailyRoiAndTeamLevel(offDates)
  const sundayToday = isSundayIst()

  const addDate = (dayKey: string) => {
    const key = dayKey.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      toast.error('Use a valid date (YYYY-MM-DD)')
      return
    }
    if (offDates.includes(key)) {
      toast.error('That date is already in the list')
      return
    }
    setOffDates((prev) => [...prev, key].sort())
  }

  const removeDate = (dayKey: string) => {
    setOffDates((prev) => prev.filter((d) => d !== dayKey))
  }

  const toggleToday = () => {
    if (todayOff) removeDate(todayKey)
    else addDate(todayKey)
  }

  const persist = async () => {
    setBusy(true)
    try {
      const normalized = normalizeRoiOffDates(offDates)
      await save({ roiOffDates: normalized }, 'adminRoiOffDates')
      setOffDates(normalized)
      toast.success('ROI holiday dates saved')
    } catch {
      toast.error('Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">ROI off / holidays</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick calendar days when <strong className="text-zinc-300">no daily ROI</strong> and{' '}
          <strong className="text-zinc-300">no team level commission</strong> are paid. The nightly job runs at{' '}
          <strong className="text-zinc-300">12:00 AM IST</strong> ({ROI_CALENDAR_TZ}).
        </p>
      </div>

      <Card className="space-y-4 border-amber-900/30 p-6">
        <h2 className="text-lg font-medium text-[#d4af37]">Today ({todayWeekday})</h2>
        <p className="text-sm text-zinc-400">
          IST date: <code className="text-zinc-200">{todayKey}</code>
          {sundayToday ? (
            <span className="ms-2 text-amber-400">— Sunday is always off (built-in).</span>
          ) : null}
        </p>
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            skipToday
              ? 'border-amber-700/50 bg-amber-950/40 text-amber-100'
              : 'border-emerald-800/40 bg-emerald-950/30 text-emerald-100'
          }`}
        >
          {skipToday ? (
            <>
              <strong>OFF</strong> — no ROI or team level commission for today&apos;s run.
              {sundayToday && !todayOff ? ' (Sunday rule)' : todayOff ? ' (admin holiday)' : ''}
            </>
          ) : (
            <>
              <strong>ON</strong> — tonight&apos;s run will credit ROI and team level commission as usual.
            </>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={todayOff}
            disabled={sundayToday}
            onChange={toggleToday}
          />
          Turn off ROI &amp; team level commission for <strong className="text-zinc-100">today</strong> (
          {todayKey})
        </label>
        {sundayToday ? (
          <p className="text-xs text-zinc-500">Sunday is already skipped; you do not need to add it here.</p>
        ) : null}
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-medium text-zinc-100">Holiday dates</h2>
        <p className="text-sm text-zinc-500">
          Add any future or today date. Members will not receive daily ROI or team level income from that night&apos;s
          cron run.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Date (IST calendar day)</Label>
            <Input
              type="date"
              className="mt-1"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => addDate(pickDate)}>
            Add date
          </Button>
          <Button type="button" variant="outline" onClick={() => addDate(todayKey)}>
            Add today
          </Button>
        </div>

        {offDates.length === 0 ? (
          <p className="text-sm text-zinc-500">No extra off dates configured (Sundays still off).</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {offDates.map((dayKey) => {
              const isToday = dayKey === todayKey
              return (
                <li key={dayKey} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="text-zinc-200">
                    <code>{dayKey}</code>
                    <span className="ms-2 text-zinc-500">{formatOffDateLabel(dayKey)}</span>
                    {isToday ? (
                      <span className="ms-2 rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-200">today</span>
                    ) : null}
                  </span>
                  <Button type="button" variant="outline" className="text-xs" onClick={() => removeDate(dayKey)}>
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Save holiday schedule
        </Button>
      </Card>
    </motion.div>
  )
}
