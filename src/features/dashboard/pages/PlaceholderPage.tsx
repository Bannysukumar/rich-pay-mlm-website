import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'

export function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold text-zinc-100">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <Card className="border-dashed border-rich-gold/25">
        <p className="text-sm text-zinc-400">
          This module is wired into routing and Firestore collections. Extend this view with tables, forms,
          and Cloud Function hooks following the same patterns as Deposits and Dashboard home.
        </p>
      </Card>
    </motion.div>
  )
}
