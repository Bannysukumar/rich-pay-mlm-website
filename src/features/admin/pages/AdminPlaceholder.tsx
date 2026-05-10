import { Card } from '@/components/ui/Card'

export function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-zinc-100">{title}</h1>
      <Card className="border-red-900/20 bg-red-950/10 p-6">
        <p className="text-sm text-zinc-400">
          Admin module shell — wire Firestore writes through audited Cloud Functions, enforce custom claims, and
          connect list/detail UIs to the collections defined in the architecture brief.
        </p>
      </Card>
    </div>
  )
}
