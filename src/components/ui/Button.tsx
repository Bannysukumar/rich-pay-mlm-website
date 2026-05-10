import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

const variants = {
  primary:
    'bg-gradient-to-r from-[#c9a227] to-[#8b6914] text-black font-semibold shadow-[0_0_24px_-4px_rgba(212,175,55,0.55)] hover:brightness-110',
  outline:
    'border border-rich-gold/40 text-rich-gold hover:bg-rich-gold/10',
  ghost: 'text-zinc-300 hover:bg-white/5',
  danger: 'bg-red-600/90 text-white hover:bg-red-600',
} as const

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm transition-all disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
