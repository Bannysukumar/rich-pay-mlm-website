import XLSX from 'xlsx'
import path from 'node:path'
import fs from 'node:fs'

const wb = XLSX.readFile(path.join('..', 'admin_exports', 'Withdrawals.xlsx'))
const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
const valid = all.filter(
  (r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXHASH ?? '').trim().length > 0,
)

const dot = valid.filter((r) => String(r.TXHASH).trim() === '.')
console.log(`"." TXHASH rows: ${dot.length}`)
for (const r of dot) {
  console.log(`  USERID=${r.USERID}  NAME=${r.NAME}  DATE=${r.DATE}  AMT=${r.AMOUNT}  FEE=${r['DED.']}  NET=${r.NETT}  ADDR=${(r.ADDRESS ?? '').slice(0, 20)}`)
}

console.log('\nDate format samples (first 10 real rows):')
const real = valid.filter((r) => String(r.TXHASH).trim() !== '.')
for (const r of real.slice(0, 10)) {
  console.log(`  ${r.DATE}  ->  parsed: ${new Date(r.DATE).toString()}`)
}
console.log(`...last:`)
for (const r of real.slice(-3)) {
  console.log(`  ${r.DATE}  ->  parsed: ${new Date(r.DATE).toString()}`)
}

console.log('\nDate field types across valid rows:')
const types = new Map()
for (const r of valid) {
  const t = typeof r.DATE
  types.set(t, (types.get(t) ?? 0) + 1)
}
for (const [t, n] of types) console.log(`  ${t} : ${n}`)

console.log('\nAmount distribution:')
function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const buckets = new Map()
for (const r of valid) {
  const a = money(r.AMOUNT)
  buckets.set(a, (buckets.get(a) ?? 0) + 1)
}
const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0])
for (const [a, n] of sorted) console.log(`  $${a.toFixed(2).padStart(8)} : ${n}`)
