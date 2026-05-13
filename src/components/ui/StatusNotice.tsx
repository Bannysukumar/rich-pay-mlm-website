import { CheckSquare, WarningCircle, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils/cn'

export type StatusNoticeVariant = 'success' | 'error'

export type StatusNoticeProps = {
  variant: StatusNoticeVariant
  /** Shown after the bold “Success !” / “Error !” line (same pattern as richpay.world status). */
  message: string
  /** Outer “Status” title above the coloured panel (default true). */
  showStatusHeading?: boolean
  onDismiss?: () => void
  className?: string
}

/**
 * In-page status panel styled like the legacy RichPay “Status” success strip:
 * dark card, bright green (or red) inner panel, check icon, bold prefix, dismiss X.
 */
export function StatusNotice({
  variant,
  message,
  showStatusHeading = true,
  onDismiss,
  className,
}: StatusNoticeProps) {
  const isOk = variant === 'success'

  return (
    <div
      className={cn(
        'mb-4 rounded-xl border border-zinc-700/90 bg-[#1a1d24] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.35)]',
        className,
      )}
      role="status"
    >
      {showStatusHeading ? (
        <h4 className="mb-3 text-lg font-semibold tracking-tight text-white">Status</h4>
      ) : null}

      <div
        className={cn(
          'relative flex gap-3 rounded-xl px-3 py-3 pr-11 shadow-inner',
          isOk
            ? 'bg-[#22c55e] text-[#0f172a]'
            : 'bg-[#dc2626] text-[#fff7f7] ring-1 ring-red-900/30',
        )}
      >
        {onDismiss ? (
          <button
            type="button"
            className={cn(
              'absolute right-2 top-2 rounded-md p-1 transition-colors',
              isOk ? 'text-[#0f172a] hover:bg-black/10' : 'text-white hover:bg-white/15',
            )}
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <X size={20} weight="bold" />
          </button>
        ) : null}

        <div className="mt-0.5 shrink-0">
          {isOk ? (
            <CheckSquare size={28} weight="fill" className="text-[#0f172a]" aria-hidden />
          ) : (
            <WarningCircle size={28} weight="fill" className="text-white" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="m-0">
            <span className="font-extrabold tracking-tight">{isOk ? 'Success !' : 'Error !'}</span>
            {message.trim().length > 0 ? (
              <>
                {' '}
                {message.trim()}
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  )
}
