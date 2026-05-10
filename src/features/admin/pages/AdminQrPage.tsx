import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import { storage } from '@/lib/firebase'

export function AdminQrPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [busy, setBusy] = useState(false)
  const [wallet, setWallet] = useState('')
  const [network, setNetwork] = useState('BEP20')
  const [minDep, setMinDep] = useState('50')
  const [instr, setInstr] = useState('')

  useEffect(() => {
    if (!ready) return
    setWallet(String(data.depositWalletAddress ?? ''))
    setNetwork(String(data.depositNetwork ?? ''))
    setMinDep(String(Number(data.minDeposit ?? 50)))
    setInstr(String(data.depositInstructions ?? ''))
  }, [data, ready])

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const path = `site/qr_${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const r = ref(storage, path)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      await save({ qrCodeUrl: url })
      toast.success('QR asset published')
    } catch {
      toast.error('Upload failed — check Storage rules')
    } finally {
      setBusy(false)
    }
  }

  const persist = async () => {
    setBusy(true)
    try {
      await save({
        depositWalletAddress: wallet.trim(),
        depositNetwork: network.trim(),
        minDeposit: Number(minDep),
        depositInstructions: instr.trim(),
      })
      toast.success('Deposit rails updated globally')
    } catch {
      toast.error('Persist failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">QR & Deposit Address</h1>
        <p className="text-sm text-zinc-500">Members see refresh instantly on QR + deposit onboarding.</p>
      </div>

      <Card className="space-y-4 border-red-900/25 p-6">
        {data.qrCodeUrl ? (
          <img src={String(data.qrCodeUrl)} alt="QR preview" className="max-h-48 rounded-lg border border-zinc-800" />
        ) : (
          <p className="text-xs text-zinc-500">No QR asset uploaded yet.</p>
        )}
        <div>
          <Label>Replace QR PNG / JPG</Label>
          <Input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <Card className="grid gap-4 border-red-900/25 p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Treasury address</Label>
          <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
        </div>
        <div>
          <Label>Network label</Label>
          <Input value={network} onChange={(e) => setNetwork(e.target.value)} />
        </div>
        <div>
          <Label>Minimum invoice</Label>
          <Input value={minDep} onChange={(e) => setMinDep(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Counterparty instructions</Label>
          <textarea
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            className="min-h-[92px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-2 text-xs text-zinc-200 outline-none ring-red-900/50 focus:border-red-800"
          />
        </div>
        <Button type="button" variant="danger" disabled={busy || !ready} className="md:col-span-2" onClick={() => void persist()}>
          Emit configuration
        </Button>
      </Card>
    </motion.div>
  )
}
