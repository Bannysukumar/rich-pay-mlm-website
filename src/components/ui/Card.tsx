import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'card-glass glow-border rounded-2xl border border-rich-border/50 p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.85)]',
        className,
      )}
      {...props}
    />
  )
}
