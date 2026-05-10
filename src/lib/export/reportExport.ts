import { jsPDF } from 'jspdf'

/** Minimal tabular PDF for admin exports — extend with autoTable or server-side Excel as needed */
export function exportRowsPdf(filename: string, title: string, headers: string[], rows: string[][]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin
  doc.setFontSize(14)
  doc.text(title, margin, y)
  y += 28
  doc.setFontSize(9)
  doc.setTextColor(120)
  headers.forEach((h, i) => doc.text(h, margin + i * 90, y))
  y += 16
  doc.setTextColor(40)
  rows.slice(0, 80).forEach((row) => {
    row.forEach((cell, i) => doc.text(String(cell).slice(0, 32), margin + i * 90, y))
    y += 14
    if (y > 780) {
      doc.addPage()
      y = margin
    }
  })
  doc.save(filename)
}

export function toCsv(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}
