import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import { storage } from '@/lib/firebase'
import {
  DEFAULT_REFERRAL_WHATSAPP_TEMPLATE,
  REFERRAL_LINK_PLACEHOLDER,
  buildReferralWhatsappMessage,
  openReferralWhatsappShare,
} from '@/lib/referralShareMessage'

const SAMPLE_LINK = 'https://richpay.live/register?ref=4448550'

export function AdminReferralSharePage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [template, setTemplate] = useState(DEFAULT_REFERRAL_WHATSAPP_TEMPLATE)
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    const raw = data.referralWhatsappShareTemplate
    if (raw === undefined || raw === null) {
      setTemplate(DEFAULT_REFERRAL_WHATSAPP_TEMPLATE)
    } else {
      setTemplate(String(raw))
    }
    setImageUrl(String(data.referralWhatsappShareImageUrl ?? '').trim())
  }, [data, ready])

  const previewMessage = useMemo(
    () => buildReferralWhatsappMessage(template, SAMPLE_LINK),
    [template],
  )

  const uploadImage = async (file: File) => {
    setBusy(true)
    try {
      const path = `site/referral_share/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const r = ref(storage, path)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      setImageUrl(url)
      await save({ referralWhatsappShareImageUrl: url }, 'adminReferralShareImage')
      toast.success('Promo image uploaded')
    } catch {
      toast.error('Upload failed — check Storage rules (admin → site/)')
    } finally {
      setBusy(false)
    }
  }

  const persist = async () => {
    setBusy(true)
    try {
      await save(
        {
          referralWhatsappShareTemplate: template.trim(),
          referralWhatsappShareImageUrl: imageUrl.trim() || null,
        },
        'adminReferralShareSave',
      )
      toast.success('Referral WhatsApp message saved')
    } catch {
      toast.error('Save failed')
    } finally {
      setBusy(false)
    }
  }

  const clearImage = async () => {
    setImageUrl('')
    try {
      await save({ referralWhatsappShareImageUrl: null }, 'adminReferralShareClearImage')
      toast.success('Promo image removed')
    } catch {
      toast.error('Could not clear image')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Referral WhatsApp message</h1>
        <p className="text-sm text-[#9898a8]">
          Members use this text when they tap <strong className="text-[#e4e4e7]">Share on WhatsApp</strong> on the
          dashboard and referral link page. Clear all text and save to share <strong className="text-[#e4e4e7]">only the
          referral link</strong>. Use <code className="text-[#f5e6a8]">{REFERRAL_LINK_PLACEHOLDER}</code> in the
          template where the personal signup URL should go.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <Label>Message template</Label>
          <textarea
            className="mt-1 min-h-[320px] w-full rounded border border-[#444] bg-[#1a1a1a] p-3 font-mono text-[12px] leading-relaxed text-[#e4e4e7]"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            spellCheck={false}
          />
          <p className="mt-2 text-[10px] text-[#6b6b7c]">
            WhatsApp supports *bold* with asterisks. Line breaks are preserved. Empty template = link only. If you
            add text without {REFERRAL_LINK_PLACEHOLDER}, the link is appended at the end.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setTemplate('')}>
            Link only (clear message)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTemplate(DEFAULT_REFERRAL_WHATSAPP_TEMPLATE)}
          >
            Reset to default text
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!template.includes(REFERRAL_LINK_PLACEHOLDER)}
            onClick={() => {
              if (!template.includes(REFERRAL_LINK_PLACEHOLDER)) {
                setTemplate((t) => `${t.trim()}\n\n${REFERRAL_LINK_PLACEHOLDER}`)
              }
            }}
          >
            Insert {REFERRAL_LINK_PLACEHOLDER}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-medium text-[#d4af37]">Optional promo image</h2>
        <p className="text-sm text-[#9898a8]">
          Shown on the member referral hub. On phones that support it, Share may attach this image with the message.
          Image is optional.
        </p>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Referral promo preview"
            className="max-h-56 rounded-lg border border-[rgba(212,175,55,0.25)] object-contain"
          />
        ) : (
          <p className="text-xs text-[#6b6b7c]">No image uploaded.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label>Upload PNG / JPG</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadImage(file)
                e.target.value = ''
              }}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Label>Or paste image URL</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          </div>
          {imageUrl ? (
            <Button type="button" variant="outline" onClick={() => void clearImage()}>
              Remove image
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-medium text-[#d4af37]">Preview</h2>
        <pre
          className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-[#333] bg-[#111] p-3 text-[12px] text-[#ccc]"
        >
          {previewMessage || '(link only — no extra text)'}
        </pre>
        <Button
          type="button"
          variant="outline"
          onClick={() => void openReferralWhatsappShare(previewMessage, imageUrl || null)}
        >
          Test WhatsApp share (sample link)
        </Button>
      </Card>

      <Button type="button" disabled={busy || !ready} onClick={() => void persist()}>
        {busy ? 'Saving…' : 'Save message & image'}
      </Button>
    </div>
  )
}
