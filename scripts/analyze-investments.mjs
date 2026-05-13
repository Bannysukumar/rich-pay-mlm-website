import XLSX from 'xlsx'
import path from 'node:path'

const EXPORTS = path.resolve('..', 'admin_exports')

function load(file) {
  const wb = XLSX.readFile(path.join(EXPORTS, file))
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
}

function parseMoney(v) {
  if (v == null) return 0
  const s = String(v).replace(/[^0-9.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

const invs = load('View All Investments.xlsx').filter((r) => /^\d+$/.test(String(r.USERID ?? '').trim()))
const members = load('Members List.xlsx').filter((r) => /^\d+$/.test(String(r.USERID ?? '').trim()))

console.log('Investments rows:', invs.length)
console.log('Members:', members.length)

const byUser = new Map()
for (const r of invs) {
  const uid = String(r.USERID).trim()
  const amt = parseMoney(r.AMOUNT)
  const arr = byUser.get(uid) ?? []
  arr.push({ amount: amt, date: r['DATE'], name: r.NAME })
  byUser.set(uid, arr)
}

console.log('Unique users with investments:', byUser.size)

let total = 0
const multiInvestors = []
for (const [uid, arr] of byUser) {
  const sum = arr.reduce((s, x) => s + x.amount, 0)
  total += sum
  if (arr.length > 1) multiInvestors.push({ uid, count: arr.length, sum, max: Math.max(...arr.map((x) => x.amount)) })
}

console.log('Total investment $:', total)
console.log('Users with >1 investment:', multiInvestors.length)
console.log('Top multi-investors:')
for (const m of multiInvestors.sort((a, b) => b.count - a.count).slice(0, 10)) console.log(' ', m)

// Cross-check with Members List TOTAL INV.
let matchTotal = 0
let mismatchTotal = 0
let memberWithoutInv = 0
const totMismatches = []
for (const m of members) {
  const uid = String(m.USERID).trim()
  const expectedTotal = parseMoney(m['TOTAL INV.'])
  const arr = byUser.get(uid)
  const computedSum = arr ? arr.reduce((s, x) => s + x.amount, 0) : 0
  if (!arr) {
    if (expectedTotal > 0) memberWithoutInv++
    continue
  }
  if (Math.abs(expectedTotal - computedSum) < 0.005) matchTotal++
  else {
    mismatchTotal++
    if (totMismatches.length < 10) totMismatches.push({ uid, name: m.NAME, expectedTotal, computedSum })
  }
}
console.log('Members where TOTAL INV. matches sum of investments:', matchTotal)
console.log('Members where TOTAL INV. mismatches:', mismatchTotal)
console.log('Members with TOTAL INV. > 0 but no rows in View All Investments:', memberWithoutInv)
console.log('First 10 mismatches:')
for (const m of totMismatches) console.log(' ', m)

// Investment users not in Members
const memberIds = new Set(members.map((m) => String(m.USERID).trim()))
const orphanInvUsers = [...byUser.keys()].filter((u) => !memberIds.has(u))
console.log('Investment USERIDs not in Members:', orphanInvUsers)

// Distinct amounts (looks like package tiers)
const amountBuckets = new Map()
for (const r of invs) {
  const a = parseMoney(r.AMOUNT)
  amountBuckets.set(a, (amountBuckets.get(a) ?? 0) + 1)
}
console.log('Distinct AMOUNT buckets:', [...amountBuckets.entries()].sort((a, b) => a[0] - b[0]))
