import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-rich-border/80 bg-rich-void/90 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-rich-gold/50 focus:ring-1 focus:ring-rich-gold/30',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500',
        className,
      )}
    >
      {children}
    </label>
  )
}
