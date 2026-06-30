/**
 * Manually run the deployed `processDailyRoi` function (same logic as midnight IST cron).
 * Invokes the Cloud Run service directly with the service account ID token.
 *
 * Usage:
 *   node scripts/run-daily-roi-now.mjs <service-account.json>
 *   node scripts/run-daily-roi-now.mjs <service-account.json> --dry-run
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))
const { GoogleAuth } = require(join(__dirname, '../functions/node_modules/google-auth-library'))

/** Deployed `processDailyRoi` Cloud Run URL (us-central1). */
const PROCESS_DAILY_ROI_URL =
  process.env.PROCESS_DAILY_ROI_URL || 'https://processdailyroi-mkh45agowa-uc.a.run.app'

const IST = 'Asia/Kolkata'
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DRY = process.argv.includes('--dry-run')
const [keyPath] = args

if (!keyPath || process.argv.includes('-h')) {
  console.error('Usage: node scripts/run-daily-roi-now.mjs <service-account.json> [--dry-run]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
const projectId = sa.project_id || 'richpay-live-fe3f1'
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

function istDayKey(when = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    when,
  )
}

function istWeekdayIndex(when = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'short' }).format(when)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

function istDayBounds(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 3600000
  return { startMs, endMs: startMs + 86400000 }
}

async function countTodayRoi() {
  const today = istDayKey()
  const { startMs, endMs } = istDayBounds(today)
  const snap = await db
    .collection('dailyProfits')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startMs))
    .where('createdAt', '<', admin.firestore.Timestamp.fromMillis(endMs))
    .get()
  const total = snap.docs.reduce((s, d) => s + Number(d.data().amount ?? 0), 0)
  return { today, rows: snap.size, total }
}

async function invokeProcessDailyRoi() {
  const auth = new GoogleAuth({ credentials: sa, projectId })
  const client = await auth.getIdTokenClient(PROCESS_DAILY_ROI_URL)
  const r = await client.request({ url: PROCESS_DAILY_ROI_URL, method: 'POST', data: {} })
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`processDailyRoi returned HTTP ${r.status}`)
  }
}

async function main() {
  const today = istDayKey()
  const wd = istWeekdayIndex()
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'long' }).format(new Date())
  const cfg = (await db.collection('siteSettings').doc('config').get()).data() || {}
  const offW = Array.isArray(cfg.roiOffWeekdays) ? cfg.roiOffWeekdays : [0]
  const offD = Array.isArray(cfg.roiOffDates) ? cfg.roiOffDates : []

  console.log(`IST date: ${today} (${weekday}, index ${wd})`)
  console.log(`roiEnabled: ${cfg.roiEnabled !== false}`)
  console.log(`roiOffWeekdays: ${JSON.stringify(offW)} — skip today: ${offW.includes(wd)}`)
  console.log(`roiOffDates includes today: ${offD.includes(today)}`)

  const before = await countTodayRoi()
  console.log(`dailyProfits before: ${before.rows} rows, $${before.total.toFixed(2)}`)
  if (before.rows > 0) {
    console.warn(
      `Note: IST ${today} already has daily ROI rows. After deploying idempotency, re-runs skip packages already credited today.`,
    )
  }

  if (cfg.roiEnabled === false) {
    console.error('ROI is disabled in site settings.')
    process.exit(1)
  }
  if (offW.includes(wd)) {
    console.error(`Today (${weekday}) is in roiOffWeekdays — scheduler would skip. Aborting.`)
    process.exit(1)
  }
  if (offD.includes(today)) {
    console.error(`Today (${today}) is in roiOffDates — scheduler would skip. Aborting.`)
    process.exit(1)
  }

  if (DRY) {
    console.log(`Dry run — would POST ${PROCESS_DAILY_ROI_URL}`)
    return
  }

  console.log(`Invoking processDailyRoi: ${PROCESS_DAILY_ROI_URL}`)
  await invokeProcessDailyRoi()
  console.log('Function invoked. Waiting for ROI credits (up to 3 min)...')

  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const cur = await countTodayRoi()
    if (cur.rows > before.rows) {
      console.log(`Done. dailyProfits now: ${cur.rows} rows (+${cur.rows - before.rows}), $${cur.total.toFixed(2)} credited today.`)
      return
    }
    process.stdout.write('.')
  }

  const after = await countTodayRoi()
  console.log(
    `\nNo new dailyProfits after 3 min. Rows: ${after.rows}, total $${after.total.toFixed(2)}. Check Cloud Functions logs for processDailyRoi.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
