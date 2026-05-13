import XLSX from 'xlsx'
import path from 'node:path'

const wb = XLSX.readFile(path.join('..', 'admin_exports', 'View Compounding Investments.xlsx'))
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })

console.log(`Total rows: ${rows.length}\n`)
console.log('All compounding rows:')
for (const r of rows) console.log(' ', r)

const ids = new Set(rows.map((r) => String(r.USERID).trim()))
console.log('\nUnique USERIDs:', ids.size)

const amounts = rows.reduce((m, r) => {
  const a = Number(String(r.AMOUNT).replace(/[^0-9.]/g, ''))
  m[a] = (m[a] || 0) + 1
  return m
}, {})
console.log('Amount buckets:', amounts)
