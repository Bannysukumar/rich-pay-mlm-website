import type { ReferralCampaign } from '@/types/models'

type Props = {
  campaign: ReferralCampaign
  onDismiss: () => void
}

/** Full-screen popup shown on member dashboard when admin enables campaign banner. */
export function ReferralCampaignBannerModal({ campaign, onDismiss }: Props) {
  const imageUrl = String(campaign.bannerImageUrl ?? '').trim()
  const message = String(campaign.bannerMessage ?? '').trim()
  const title = String(campaign.bannerTitle ?? campaign.title ?? 'Announcement').trim()

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="referral-campaign-banner-title"
      style={{ background: 'rgba(0,0,0,0.72)', zIndex: 1060 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div
          className="modal-content border-0 text-light shadow-lg"
          style={{
            background: 'linear-gradient(160deg, #1a1a1a 0%, #0d0d0d 100%)',
            border: '1px solid rgba(212,175,55,0.35)',
          }}
        >
          <div className="modal-header border-secondary border-opacity-25">
            <h5 id="referral-campaign-banner-title" className="modal-title" style={{ color: '#d4af37' }}>
              {title}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              aria-label="View rewards"
              onClick={onDismiss}
            />
          </div>
          <div className="modal-body p-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="d-block w-100"
                style={{ maxHeight: 'min(70vh, 520px)', objectFit: 'contain', background: '#000' }}
              />
            ) : null}
            {message ? (
              <p
                className="mb-0 px-4 py-3"
                style={{ color: '#e8e8e8', whiteSpace: 'pre-wrap' }}
              >
                {message}
              </p>
            ) : imageUrl ? null : (
              <p className="px-4 py-3 text-secondary small mb-0">New promotion — check your referral rewards below.</p>
            )}
          </div>
          <div className="modal-footer border-secondary border-opacity-25 justify-content-center">
            <button
              type="button"
              className="btn px-4"
              style={{ background: '#d4af37', color: '#1a1a1a', fontWeight: 600 }}
              onClick={onDismiss}
            >
              View rewards
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
