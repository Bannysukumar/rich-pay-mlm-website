import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { updateMemberProfile } from '@/lib/api/profileCallables'
import { useAuthState } from '@/hooks/useAuth'

const schema = z.object({
  fullName: z.string().min(2, 'Name required'),
  phone: z.string().min(8, 'Valid mobile required'),
  city: z.string(),
  usdtBep20Address: z
    .string()
    .refine((v) => v === '' || /^0x[a-fA-F0-9]{40}$/.test(v), 'Use a valid 0x… BEP20 address or leave empty'),
  transactionPassword: z.string().optional(),
})

type Form = z.infer<typeof schema>

export function ProfilePage() {
  const { profile, firebaseUid } = useAuthState()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      city: '',
      usdtBep20Address: '',
      transactionPassword: '',
    },
  })

  useEffect(() => {
    if (!profile) return
    reset({
      fullName: profile.fullName,
      phone: profile.phone,
      city: profile.city ?? '',
      usdtBep20Address: profile.usdtBep20Address ?? '',
      transactionPassword: '',
    })
  }, [profile, reset])

  const onSubmit = async (data: Form) => {
    if (!firebaseUid) return
    try {
      await updateMemberProfile({
        fullName: data.fullName.trim(),
        phone: data.phone.trim().replace(/\s+/g, ''),
        city: data.city.trim(),
        usdtBep20Address: data.usdtBep20Address.trim(),
        transactionPassword: data.transactionPassword?.trim() || undefined,
      })
      toast.success('Profile updated')
      reset((prev) => ({ ...prev, transactionPassword: '' }))
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
      toast.error(msg || 'Could not update profile')
    }
  }

  if (!profile) {
    return (
      <div className="container-fluid py-4 px-3">
        <div className="alert alert-secondary border border-secondary">Loading profile…</div>
      </div>
    )
  }

  return (
    <div className="container-fluid py-4 px-3">
      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="card ki-profile-card border-secondary bg-dark text-light">
            <div className="card-header border-secondary bg-transparent py-3">
              <h4 className="card-title mb-0" style={{ color: 'var(--ki-gold)' }}>
                Profile
              </h4>
            </div>
            <div className="card-body">
              <form className="basic-form" onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
                <div className="mb-3">
                  <div className="form-label text-secondary small">Name</div>
                  <input type="text" className="form-control ki-form-control" placeholder="Name" {...register('fullName')} />
                  {errors.fullName ? <div className="text-danger small mt-1">{errors.fullName.message}</div> : null}
                </div>

                <div className="mb-3">
                  <div className="form-label text-secondary small">Email</div>
                  <input
                    type="text"
                    className="form-control ki-form-control"
                    value={profile.email}
                    readOnly
                    disabled
                    aria-label="Email (read only)"
                  />
                  <div className="form-text text-secondary small">Email is tied to your login and cannot be changed here.</div>
                </div>

                <div className="mb-3">
                  <div className="form-label text-secondary small">Mobile</div>
                  <input type="text" className="form-control ki-form-control" placeholder="Mobile" {...register('phone')} />
                  {errors.phone ? <div className="text-danger small mt-1">{errors.phone.message}</div> : null}
                </div>

                <div className="mb-3">
                  <div className="form-label text-secondary small">City</div>
                  <input type="text" className="form-control ki-form-control" placeholder="Enter City" {...register('city')} />
                </div>

                <div className="mb-3">
                  <div className="form-label text-secondary small">USDT (BEP20) Address</div>
                  <input
                    type="text"
                    className="form-control ki-form-control"
                    placeholder="USDT Address"
                    autoComplete="off"
                    {...register('usdtBep20Address')}
                  />
                  {errors.usdtBep20Address ? (
                    <div className="text-danger small mt-1">{errors.usdtBep20Address.message}</div>
                  ) : null}
                </div>

                <div className="mb-4">
                  <div className="form-label text-secondary small">Transaction Password</div>
                  <input
                    type="password"
                    className="form-control ki-form-control"
                    placeholder="Transaction Password"
                    autoComplete="new-password"
                    {...register('transactionPassword')}
                  />
                  <div className="form-text text-secondary small">
                    {profile.transactionPinSet
                      ? 'Leave blank to keep your current transaction password.'
                      : 'Set a PIN used for sensitive actions (stored securely on the server).'}
                  </div>
                  {errors.transactionPassword ? (
                    <div className="text-danger small mt-1">{errors.transactionPassword.message}</div>
                  ) : null}
                </div>

                <button type="submit" className="btn btn-primary px-4" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Submit'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
