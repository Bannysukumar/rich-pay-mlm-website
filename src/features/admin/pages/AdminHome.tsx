import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'

const sample = [
  { name: 'Deposits', v: 42 },
  { name: 'Activations', v: 28 },
  { name: 'Withdrawals', v: 16 },
  { name: 'ROI Paid', v: 55 },
]

export function AdminHome() {
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl text-zinc-100">Institutional Control Room</h1>
        <p className="mt-1 text-sm text-zinc-500">Live platform telemetry (sample data until analytics wire-up)</p>
      </motion.div>
      <div className="grid gap-4 md:grid-cols-4">
        {['AUM', 'Active Users', 'Pending Tickets', 'Risk Flags'].map((k, i) => (
          <Card key={k} className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</p>
            <p className="mt-2 font-mono text-xl text-red-300">{[128400, 842, 3, 0][i]}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Flow mix</p>
        <div className="mt-4 w-full min-h-[16rem]" style={{ minHeight: 256 }}>
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={sample}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b32" />
              <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#0f1014',
                  border: '1px solid rgba(220,38,38,0.35)',
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="v" fill="rgba(220,38,38,0.75)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
