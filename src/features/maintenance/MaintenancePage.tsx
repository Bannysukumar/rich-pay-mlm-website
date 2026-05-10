import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'

export function MaintenancePage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-rich-black px-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="max-w-md p-10 text-center glow-border">
          <h1 className="font-display text-2xl text-gradient-gold">Scheduled Maintenance</h1>
          <p className="mt-4 text-sm text-zinc-400">
            We are upgrading ledger infrastructure. Please check back shortly.
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
