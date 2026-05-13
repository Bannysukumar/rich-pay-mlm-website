import XLSX from 'xlsx'
import path from 'node:path'

const EXPORTS = path.resolve('..', 'admin_exports')

function loadRows(file) {
  const wb = XLSX.readFile(path.join(EXPORTS, file))
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

function isValidRow(r) {
  const uid = String(r.USERID ?? '').trim()
  return /^\d+$/.test(uid)
}

const members = loadRows('Members List.xlsx').filter(isValidRow)
const cash = loadRows('Wallet Balance (Cash Wallet).xlsx').filter(isValidRow)
const act = loadRows('Wallet Balance (Activation Wallet).xlsx').filter(isValidRow)

console.log('Members rows:', members.length)
console.log('Cash rows:', cash.length)
console.log('Act rows:', act.length)

const memberIds = new Set(members.map((r) => String(r.USERID).trim()))
const cashIds = new Set(cash.map((r) => String(r.USERID).trim()))
const actIds = new Set(act.map((r) => String(r.USERID).trim()))

console.log('Members USERIDs unique count:', memberIds.size)
console.log('Cash USERIDs unique count:', cashIds.size)
console.log('Act USERIDs unique count:', actIds.size)

const cashNotInMembers = [...cashIds].filter((id) => !memberIds.has(id))
const actNotInMembers = [...actIds].filter((id) => !memberIds.has(id))
console.log('Cash USERIDs NOT in Members:', cashNotInMembers)
console.log('Act USERIDs NOT in Members:', actNotInMembers)

const membersWithoutCredentials = members.filter((r) => {
  const id = String(r.USERID).trim()
  return !cashIds.has(id) && !actIds.has(id)
})
console.log('Members WITHOUT password from cash/act sheets:', membersWithoutCredentials.length)

const sponsors = members.map((r) => String(r.SPONSOR ?? '').trim()).filter((s) => s && s !== '0')
const sponsorSet = new Set(sponsors)
const missingSponsors = [...sponsorSet].filter((s) => !memberIds.has(s))
console.log('Distinct sponsors:', sponsorSet.size)
console.log('Sponsors not in Members:', missingSponsors)

const maxId = [...memberIds].reduce((m, x) => Math.max(m, Number(x)), 0)
const minId = [...memberIds].reduce((m, x) => Math.min(m, Number(x)), Infinity)
console.log('Min USERID:', minId, 'Max USERID:', maxId)

const empties = members.filter((r) => !r.NAME || !String(r.NAME).trim())
console.log('Members with empty NAME:', empties.length)

const dupIds = members
  .map((r) => String(r.USERID).trim())
  .reduce((acc, id) => ((acc[id] = (acc[id] || 0) + 1), acc), {})
const duplicates = Object.entries(dupIds).filter(([, n]) => n > 1)
console.log('Duplicate USERIDs in Members:', duplicates)

let badJoined = 0
for (const r of members) {
  const j = String(r['JOINED ON'] ?? '').trim()
  if (!/^\d{2}\/\d{2}\/\d{4}/.test(j)) badJoined++
}
console.log('Members with non-DD/MM/YYYY JOINED:', badJoined)
