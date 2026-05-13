import XLSX from 'xlsx'
import path from 'node:path'
import process from 'node:process'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/inspect-xlsx.mjs <path-to-xlsx>')
  process.exit(1)
}

const wb = XLSX.readFile(path.resolve(file))
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  console.log('=== Sheet:', sheetName, '===')
  console.log('Row count:', rows.length)
  if (rows.length) {
    console.log('Columns:', Object.keys(rows[0]))
    console.log('First 5 rows:')
    for (const r of rows.slice(0, 5)) console.log(JSON.stringify(r))
    console.log('Last row:')
    console.log(JSON.stringify(rows[rows.length - 1]))
  }
}
