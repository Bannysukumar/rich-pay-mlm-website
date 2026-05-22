import type { SiteSettings } from '@/types/models'

/** Placeholder replaced with the member’s full referral URL when sharing. */
export const REFERRAL_LINK_PLACEHOLDER = '{{referralLink}}'

export const DEFAULT_REFERRAL_WHATSAPP_TEMPLATE = `*JOIN RICHPAY & START EARNING WITH ME!*

Hi! I'm earning passive daily income with RichPay, a premium financial growth platform.

----------------------------------------
EARNING HIGHLIGHTS:
----------------------------------------
-> Up to 5% Daily ROI on investments
-> 30-Level Referral Commission system
-> Rank bonuses for qualified ranks
-> 5% Instant Sponsor Reward

----------------------------------------
SIGN UP USING MY REFERRAL LINK:
----------------------------------------

${REFERRAL_LINK_PLACEHOLDER}

Start your financial freedom journey today!
Let's grow together!`

/** Admin saved `''` → link only; unset field → default marketing template. */
export function resolveReferralWhatsappTemplate(raw: unknown): string {
  if (raw === null || raw === undefined) return DEFAULT_REFERRAL_WHATSAPP_TEMPLATE
  if (raw === '') return ''
  const s = String(raw).trim()
  if (s.length === 0) return ''
  return s
}

/** @deprecated Use resolveReferralWhatsappTemplate */
export function normalizeReferralWhatsappTemplate(raw: unknown): string {
  return resolveReferralWhatsappTemplate(raw)
}

export function buildReferralWhatsappMessage(
  template: unknown,
  referralLink: string,
): string {
  const link = referralLink.trim()
  const body = resolveReferralWhatsappTemplate(template)
  if (!body) return link
  if (body.includes(REFERRAL_LINK_PLACEHOLDER)) {
    return body.split(REFERRAL_LINK_PLACEHOLDER).join(link)
  }
  return link ? `${body}\n\n${link}` : body
}

export function referralWhatsappShareFromSettings(
  settings: Pick<SiteSettings, 'referralWhatsappShareTemplate'>,
  referralLink: string,
): string {
  return buildReferralWhatsappMessage(settings.referralWhatsappShareTemplate, referralLink)
}

export function isReferralWhatsappLinkOnly(settings: Pick<SiteSettings, 'referralWhatsappShareTemplate'>): boolean {
  return resolveReferralWhatsappTemplate(settings.referralWhatsappShareTemplate) === ''
}

export function referralWhatsappImageUrl(
  settings: Pick<SiteSettings, 'referralWhatsappShareImageUrl'>,
): string | null {
  const url = String(settings.referralWhatsappShareImageUrl ?? '').trim()
  return url.length > 0 ? url : null
}

/** Opens WhatsApp (text) or native share when an optional promo image is configured. */
export async function openReferralWhatsappShare(
  message: string,
  imageUrl?: string | null,
): Promise<void> {
  const text = message.trim()
  if (!text) return

  const img = imageUrl?.trim()
  if (img && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const res = await fetch(img)
      if (res.ok) {
        const blob = await res.blob()
        const ext = blob.type.includes('png') ? 'png' : 'jpg'
        const file = new File([blob], `richpay-referral.${ext}`, {
          type: blob.type || 'image/jpeg',
        })
        const payload: ShareData = { text, files: [file] }
        if (!navigator.canShare || navigator.canShare(payload)) {
          await navigator.share(payload)
          return
        }
      }
    } catch {
      /* fall through to wa.me */
    }
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}
