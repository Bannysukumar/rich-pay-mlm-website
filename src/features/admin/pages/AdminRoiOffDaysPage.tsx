import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import {
  DEFAULT_ROI_OFF_WEEKDAYS,
  istDayKey,
  istWeekdayIndex,
  istWeekdayLong,
  isRoiOffWeekday,
  normalizeRoiOffDates,
  normalizeRoiOffWeekdays,
  ROI_CALENDAR_TZ,
  ROI_WEEKDAY_OPTIONS,
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

function formatWeekdayList(weekdays: number[]): string {
  if (weekdays.length === 0) return 'none'
  return weekdays
    .map((d) => ROI_WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? String(d))
    .join(', ')
}

export function AdminRoiOffDaysPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [offDates, setOffDates] = useState<string[]>([])
  const [offWeekdays, setOffWeekdays] = useState<number[]>([...DEFAULT_ROI_OFF_WEEKDAYS])
  const [pickDate, setPickDate] = useState('')
  const [busy, setBusy] = useState(false)

  const todayKey = useMemo(() => istDayKey(), [])
  const todayWeekday = useMemo(() => istWeekdayLong(), [])
  const todayWeekdayIndex = useMemo(() => istWeekdayIndex(), [])

  useEffect(() => {
    if (!ready) return
    setOffDates(normalizeRoiOffDates(data.roiOffDates))
    setOffWeekdays(normalizeRoiOffWeekdays(data.roiOffWeekdays))
    if (!pickDate) setPickDate(todayKey)
  }, [data, ready, todayKey, pickDate])

  const todayOffByWeekday = isRoiOffWeekday(offWeekdays)
  const todayOffByDate = offDates.includes(todayKey)
  const skipToday = shouldSkipDailyRoiAndTeamLevel(offDates, offWeekdays)

  const toggleWeekday = (day: number) => {
    setOffWeekdays((prev) => {
      const set = new Set(prev)
      if (set.has(day)) set.delete(day)
      else set.add(day)
      return [...set].sort((a, b) => a - b)
    })
  }

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

  const toggleTodayDate = () => {
    if (todayOffByDate) removeDate(todayKey)
    else addDate(todayKey)
  }

  const persist = async () => {
    setBusy(true)
    try {
      const normalizedDates = normalizeRoiOffDates(offDates)
      const normalizedWeekdays = normalizeRoiOffWeekdays(offWeekdays)
      await save(
        {
          roiOffDates: normalizedDates,
          roiOffWeekdays: normalizedWeekdays,
        },
        'adminRoiOffSchedule',
      )
      setOffDates(normalizedDates)
      setOffWeekdays(normalizedWeekdays)
      toast.success('ROI off schedule saved')
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
          Choose <strong className="text-zinc-300">weekdays</strong> and/or{' '}
          <strong className="text-zinc-300">specific dates</strong> when{' '}
          <strong className="text-zinc-300">no daily ROI</strong> and{' '}
          <strong className="text-zinc-300">no team level commission</strong> are paid. Cron runs at{' '}
          <strong className="text-zinc-300">12:00 AM IST</strong> ({ROI_CALENDAR_TZ}).
        </p>
      </div>

      <Card className="space-y-4 border-amber-900/30 p-6">
        <h2 className="text-lg font-medium text-[#d4af37]">Today ({todayWeekday})</h2>
        <p className="text-sm text-zinc-400">
          IST date: <code className="text-zinc-200">{todayKey}</code>
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
              <strong>OFF</strong> — no ROI or team level commission for tonight&apos;s run.
              {todayOffByWeekday && todayOffByDate
                ? ' (weekday + holiday date)'
                : todayOffByWeekday
                  ? ' (weekday rule)'
                  : todayOffByDate
                    ? ' (holiday date)'
                    : ''}
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
            checked={todayOffByDate}
            onChange={toggleTodayDate}
          />
          Also mark <strong className="text-zinc-100">today</strong> ({todayKey}) as a one-off holiday
        </label>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-medium text-zinc-100">Off weekdays (recurring)</h2>
        <p className="text-sm text-zinc-500">
          Checked days never receive ROI or team level income (every week). Default: Sunday only.
        </p>
        <div className="flex flex-wrap gap-3">
          {ROI_WEEKDAY_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                offWeekdays.includes(value)
                  ? 'border-amber-700/50 bg-amber-950/30 text-amber-100'
                  : 'border-zinc-700 bg-zinc-900/40 text-zinc-300'
              }`}
            >
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={offWeekdays.includes(value)}
                onChange={() => toggleWeekday(value)}
              />
              {label}
              {value === todayWeekdayIndex ? (
                <span className="text-xs text-zinc-500">(today)</span>
              ) : null}
            </label>
          ))}
        </div>
        <p className="text-sm text-zinc-400">
          Currently off every: <strong className="text-zinc-200">{formatWeekdayList(offWeekdays)}</strong>
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOffWeekdays([...DEFAULT_ROI_OFF_WEEKDAYS])}
        >
          Reset to Sunday only
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-medium text-zinc-100">One-off holiday dates</h2>
        <p className="text-sm text-zinc-500">
          Extra calendar days off (in addition to weekdays above). Useful for festivals or special closures.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Date (IST calendar day)</Label>
            <Input type="date" className="mt-1" value={pickDate} onChange={(e) => setPickDate(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => addDate(pickDate)}>
            Add date
          </Button>
          <Button type="button" variant="outline" onClick={() => addDate(todayKey)}>
            Add today
          </Button>
        </div>

        {offDates.length === 0 ? (
          <p className="text-sm text-zinc-500">No one-off holiday dates configured.</p>
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
          Save ROI off schedule
        </Button>
      </Card>
    </motion.div>
  )
}
