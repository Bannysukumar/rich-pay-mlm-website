import { createHash } from 'node:crypto'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

admin.initializeApp()
const db = admin.firestore()

/**
 * Gen-2 callables sit behind Cloud Run. `invoker: 'public'` avoids 403 on OPTIONS preflight.
 * Explicit origins help when the web app calls `*.cloudfunctions.net` directly (e.g. before
 * Hosting `/api/call/*` rewrites). Production should prefer same-origin `/api/call/:name` (see
 * `httpsCallableHelper` + `firebase.json`).
 */
const callableRuntimeOpts = {
  cors: [
    'https://richpay.live',
    'https://www.richpay.live',
    'https://richpay-live-fe3f1.web.app',
    'https://richpay-live-fe3f1.firebaseapp.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  invoker: 'public' as const,
}

const USERNAME_START = 4448550
const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_COUNTERS = 'counters'
const COL_PHONE = 'phoneIndex'
const COL_SETTINGS = 'siteSettings'
const COL_PACKAGES = 'packages'
const COL_ACTIVE = 'activePackages'
const COL_DEPOSITS = 'deposits'
const COL_WITHDRAWALS = 'withdrawals'
const COL_DAILY = 'dailyProfits'
const COL_INTERNAL = 'internalTransfers'

function audit(actorUid: string, action: string, detail: Record<string, unknown>) {
  return db.collection('auditLogs').add({
    actorUid,
    action,
    detail,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function assertFirestoreAdmin(actorUid: string) {
  const snap = await db.collection(COL_USERS).doc(actorUid).get()
  if (!snap.exists || String(snap.data()?.role ?? '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator only')
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export const registerWithProfile = onCall(callableRuntimeOpts, async (request) => {
  const data = request.data as {
    email?: string
    password?: string
    fullName?: string
    phone?: string
    sponsorUsername?: string | null
    termsAccepted?: boolean
  }

  if (!data.termsAccepted) {
    throw new HttpsError('invalid-argument', 'Terms must be accepted')
  }
  const email = String(data.email || '')
    .trim()
    .toLowerCase()
  const password = String(data.password || '')
  const fullName = String(data.fullName || '').trim()
  const phone = String(data.phone || '').trim().replace(/\s+/g, '')
  const sponsorUsername = data.sponsorUsername ? String(data.sponsorUsername).trim() : null

  if (!email || !password || password.length < 8 || !fullName || phone.length < 8) {
    throw new HttpsError('invalid-argument', 'Invalid registration payload')
  }

  let sponsorUid: string | null = null
  if (sponsorUsername) {
    const sRef = db.collection(COL_USERS_BY_UN).doc(sponsorUsername)
    const sSnap = await sRef.get()
    if (!sSnap.exists) {
      throw new HttpsError('not-found', 'Sponsor ID does not exist')
    }
    sponsorUid = String(sSnap.data()?.uid || '')
  }

  const phoneRef = db.collection(COL_PHONE).doc(phone)
  const phoneSnap = await phoneRef.get()
  if (phoneSnap.exists) {
    throw new HttpsError('already-exists', 'Phone already registered')
  }

  const counterRef = db.collection(COL_COUNTERS).doc('usernames')

  const username = await db.runTransaction(async (tx) => {
    const cSnap = await tx.get(counterRef)
    const current = cSnap.exists ? Number(cSnap.data()?.current ?? USERNAME_START - 1) : USERNAME_START - 1
    const next = current + 1
    tx.set(counterRef, { current: next }, { merge: true })
    return String(next)
  })

  let userRecord: admin.auth.UserRecord
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
    if (code.includes('email-already-exists')) {
      throw new HttpsError('already-exists', 'Email already in use')
    }
    throw new HttpsError('internal', 'Could not create auth user')
  }

  const now = Date.now()
  const userDoc = {
    username,
    email,
    fullName,
    phone,
    sponsorUsername,
    sponsorUid,
    role: 'user',
    wallets: { deposit: 0, activation: 0, cash: 0 },
    totalWithdrawn: 0,
    activeDirects: 0,
    currentRank: '—',
    totalTeamBusiness: 0,
    nonWorkingIncomeBalance: 0,
    workingIncomeBalance: 0,
    sponsorBonusTotal: 0,
    dailyProfitsTotal: 0,
    teamLevelCommissionTotal: 0,
    rankCommissionTotal: 0,
    createdAt: now,
    updatedAt: now,
  }

  const batch = db.batch()
  batch.set(db.collection(COL_USERS).doc(userRecord.uid), userDoc)
  batch.set(db.collection(COL_USERS_BY_UN).doc(username), { uid: userRecord.uid })
  batch.set(phoneRef, { uid: userRecord.uid })
  await batch.commit()

  if (sponsorUid) {
    await db
      .collection(COL_USERS)
      .doc(sponsorUid)
      .set({ activeDirects: FieldValue.increment(1) }, { merge: true })
  }

  return { username, uid: userRecord.uid }
})

function hashTransactionPin(uid: string, pin: string) {
  return createHash('sha256').update(`${uid}:${pin}`, 'utf8').digest('hex')
}

/** Authenticated members update display fields + USDT address; optional transaction PIN (stored hashed only). */
export const updateMemberProfile = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    fullName?: string
    phone?: string
    city?: string
    usdtBep20Address?: string
    transactionPassword?: string
  }

  const fullName = String(data.fullName || '').trim()
  const phone = String(data.phone || '').trim().replace(/\s+/g, '')
  const city = String(data.city || '').trim()
  const usdtBep20Address = String(data.usdtBep20Address || '').trim()
  const transactionPasswordRaw =
    data.transactionPassword !== undefined && data.transactionPassword !== null
      ? String(data.transactionPassword)
      : ''

  if (fullName.length < 2) throw new HttpsError('invalid-argument', 'Enter your full name')
  if (phone.length < 8) throw new HttpsError('invalid-argument', 'Enter a valid mobile number')

  if (usdtBep20Address.length > 0 && !/^0x[a-fA-F0-9]{40}$/.test(usdtBep20Address)) {
    throw new HttpsError('invalid-argument', 'USDT address must be a valid 0x… BEP20 address')
  }

  if (transactionPasswordRaw.length > 0 && transactionPasswordRaw.length < 4) {
    throw new HttpsError('invalid-argument', 'Transaction password must be at least 4 characters')
  }

  const uRef = db.collection(COL_USERS).doc(uid)

  let phoneChanged = false

  await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(uRef)
    if (!uSnap.exists) throw new HttpsError('not-found', 'Profile not found')

    const oldPhone = String(uSnap.data()?.phone ?? '').trim()
    phoneChanged = oldPhone !== phone

    let oldPhoneSnap: DocumentSnapshot | null = null
    if (phoneChanged) {
      const newPhoneRef = db.collection(COL_PHONE).doc(phone)
      const newPhoneSnap = await tx.get(newPhoneRef)
      if (newPhoneSnap.exists && String(newPhoneSnap.data()?.uid ?? '') !== uid) {
        throw new HttpsError('already-exists', 'That mobile number is already registered')
      }
      if (oldPhone.length > 0) {
        oldPhoneSnap = await tx.get(db.collection(COL_PHONE).doc(oldPhone))
      }
    }

    const patch: Record<string, unknown> = {
      fullName,
      phone,
      city,
      usdtBep20Address,
      updatedAt: Date.now(),
    }

    if (transactionPasswordRaw.length > 0) {
      patch.transactionPinHash = hashTransactionPin(uid, transactionPasswordRaw)
    }

    tx.update(uRef, patch)

    if (phoneChanged) {
      tx.set(db.collection(COL_PHONE).doc(phone), { uid })
      if (oldPhone.length > 0 && oldPhoneSnap?.exists && String(oldPhoneSnap.data()?.uid ?? '') === uid) {
        tx.delete(db.collection(COL_PHONE).doc(oldPhone))
      }
    }
  })

  await admin.auth().updateUser(uid, { displayName: fullName })
  await audit(uid, 'updateMemberProfile', { phoneChanged })
  return { ok: true }
})

/** Set or update the transaction PIN (hashed). Requires current PIN when one is already set. */
export const changeTransactionPassword = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    currentPassword?: string
    newPassword?: string
  }
  const currentRaw =
    data.currentPassword !== undefined && data.currentPassword !== null
      ? String(data.currentPassword)
      : ''
  const newRaw =
    data.newPassword !== undefined && data.newPassword !== null ? String(data.newPassword) : ''

  if (newRaw.length < 4) {
    throw new HttpsError('invalid-argument', 'New transaction password must be at least 4 characters')
  }

  const uRef = db.collection(COL_USERS).doc(uid)
  const uSnap = await uRef.get()
  if (!uSnap.exists) throw new HttpsError('not-found', 'Profile not found')
  const pinHash = uSnap.data()?.transactionPinHash as string | undefined

  if (pinHash) {
    if (!currentRaw.trim()) {
      throw new HttpsError('failed-precondition', 'Enter your current transaction password')
    }
    if (hashTransactionPin(uid, currentRaw) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid current transaction password')
    }
  }

  await uRef.update({
    transactionPinHash: hashTransactionPin(uid, newRaw),
    updatedAt: Date.now(),
  })
  await audit(uid, 'changeTransactionPassword', {})
  return { ok: true }
})

/** Users who list this account as sponsor (`sponsorUid`). */
export const listDirectReferrals = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const sponsorUid = request.auth.uid

  const snap = await db.collection(COL_USERS).where('sponsorUid', '==', sponsorUid).get()
  const referrals: {
    username: string
    fullName: string
    phone: string
    createdAt: number
    amount: number
    volume: number
  }[] = []

  for (const doc of snap.docs) {
    const d = doc.data()
    const childUid = doc.id

    const apSnap = await db.collection(COL_ACTIVE).where('userId', '==', childUid).get()
    let amount = 0
    apSnap.forEach((ap) => {
      if (String(ap.data()?.status ?? '') === 'active') {
        amount += Number(ap.data()?.amount ?? 0)
      }
    })

    referrals.push({
      username: String(d.username ?? ''),
      fullName: String(d.fullName ?? ''),
      phone: String(d.phone ?? ''),
      createdAt: Number(d.createdAt ?? 0),
      amount,
      volume: Number(d.totalTeamBusiness ?? 0),
    })
  }

  referrals.sort((a, b) => b.createdAt - a.createdAt)
  return { referrals }
})

/** Full downline tree under the caller (all depths). Level 1 = direct. Batched `in` queries (max 30). */
export const listAllDownlines = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const rootUid = request.auth.uid

  const depthMap = new Map<string, number>()
  depthMap.set(rootUid, 0)
  let frontier = [rootUid]

  while (frontier.length > 0) {
    const nextFrontier: string[] = []
    for (const part of chunkArray(frontier, 30)) {
      const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get()
      for (const doc of snap.docs) {
        const id = doc.id
        if (depthMap.has(id)) continue
        const sponsor = String(doc.data()?.sponsorUid ?? '')
        const lvl = (depthMap.get(sponsor) ?? 0) + 1
        depthMap.set(id, lvl)
        nextFrontier.push(id)
      }
    }
    frontier = nextFrontier
  }

  const memberUids = [...depthMap.keys()].filter((id) => id !== rootUid)
  if (memberUids.length === 0) {
    return { downlines: [] }
  }

  const packageSum = new Map<string, number>()
  for (const uid of memberUids) packageSum.set(uid, 0)
  for (const part of chunkArray(memberUids, 30)) {
    const apSnap = await db.collection(COL_ACTIVE).where('userId', 'in', part).get()
    apSnap.forEach((ap) => {
      if (String(ap.data()?.status ?? '') !== 'active') return
      const u = String(ap.data()?.userId ?? '')
      const amt = Number(ap.data()?.amount ?? 0)
      packageSum.set(u, (packageSum.get(u) ?? 0) + amt)
    })
  }

  const userData = new Map<string, Record<string, unknown>>()
  for (const part of chunkArray(memberUids, 100)) {
    const snaps = await Promise.all(part.map((id) => db.collection(COL_USERS).doc(id).get()))
    snaps.forEach((s) => {
      if (s.exists) userData.set(s.id, s.data() as Record<string, unknown>)
    })
  }

  const downlines: {
    username: string
    fullName: string
    createdAt: number
    sponsorUsername: string
    packageAmount: number
    level: number
  }[] = []

  for (const id of memberUids) {
    const d = userData.get(id)
    if (!d) continue
    downlines.push({
      username: String(d.username ?? ''),
      fullName: String(d.fullName ?? ''),
      createdAt: Number(d.createdAt ?? 0),
      sponsorUsername: d.sponsorUsername != null ? String(d.sponsorUsername) : '—',
      packageAmount: packageSum.get(id) ?? 0,
      level: depthMap.get(id) ?? 1,
    })
  }

  downlines.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return a.username.localeCompare(b.username)
  })

  await audit(rootUid, 'listAllDownlines', { count: downlines.length })
  return { downlines }
})

/** Ki-style topup: resolve username → display name for form hint */
export const resolveUsername = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const raw = String((request.data as { username?: string })?.username ?? '').trim().toLowerCase()
  if (!raw) return { fullName: '' }
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(raw).get()
  if (!mapSnap.exists) return { fullName: 'Invalid Id' }
  const bid = mapSnap.data()!.uid as string
  const uSnap = await db.collection(COL_USERS).doc(bid).get()
  if (!uSnap.exists) return { fullName: 'Invalid Id' }
  const fn = String(uSnap.data()!.fullName ?? '').trim()
  return { fullName: fn || '—' }
})

/** Registration / invite links: resolve referral username → public display name (no sign-in required). */
export const publicResolveReferrer = onCall(callableRuntimeOpts, async (request) => {
  const raw = String((request.data as { username?: string })?.username ?? '').trim()
  if (!raw || raw.length > 96) {
    throw new HttpsError('invalid-argument', 'Invalid referral ID')
  }
  const key = raw.toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (!mapSnap.exists) return { found: false, fullName: '' }
  const bid = mapSnap.data()!.uid as string
  const uSnap = await db.collection(COL_USERS).doc(bid).get()
  if (!uSnap.exists) return { found: false, fullName: '' }
  const fn = String(uSnap.data()!.fullName ?? '').trim()
  return { found: true, fullName: fn || '—' }
})

export const activatePackage = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    packageId?: string
    amount?: number
    beneficiaryUsername?: string
    transactionPassword?: string
    planType?: number
  }
  const { packageId, amount, beneficiaryUsername, transactionPassword, planType } = data
  if (!packageId || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid package selection')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  const pinRaw = transactionPassword !== undefined && transactionPassword !== null ? String(transactionPassword) : ''
  if (pinHash) {
    if (pinRaw.length === 0) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, pinRaw) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const beneRaw = String(beneficiaryUsername ?? '').trim().toLowerCase()
  let beneficiaryUid = uid
  if (beneRaw && beneRaw !== callerUsername) {
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get()
    if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID to Topup')
    beneficiaryUid = mapSnap.data()!.uid as string
    const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get()
    if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')
    const sponsorOfBene = beneSnap.data()?.sponsorUid as string | undefined
    if (sponsorOfBene !== uid) {
      throw new HttpsError('permission-denied', 'You can only topup your direct referrals or yourself')
    }
  }

  const pkgSnap = await db.collection(COL_PACKAGES).doc(packageId).get()
  if (!pkgSnap.exists) throw new HttpsError('not-found', 'Package not found')
  const pkg = pkgSnap.data()!
  if (!pkg.active) throw new HttpsError('failed-precondition', 'Package inactive')
  const minAmount = Number(pkg.minAmount ?? 0)
  const maxAmount = Number(pkg.maxAmount ?? 0)
  if (amount < minAmount || amount > maxAmount) {
    throw new HttpsError('invalid-argument', 'Amount out of range')
  }

  const callerWallets = caller.wallets as { activation?: number; deposit?: number } | undefined
  const deposit = Number(callerWallets?.deposit ?? 0)
  if (deposit < amount * 0.5) {
    throw new HttpsError(
      'failed-precondition',
      'Minimum 50% of package value is required in Deposit Wallet',
    )
  }

  const roiPercent = Number(pkg.roiPercent ?? 0)
  const durationDays = Number(pkg.durationDays ?? 0)
  const planLabel = planType === 2 ? 'compounding' : 'daily'
  const apRef = db.collection(COL_ACTIVE).doc()

  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    if (!uSnap.exists) throw new HttpsError('not-found', 'User missing')
    const wallets = uSnap.data()?.wallets as { activation: number; deposit?: number } | undefined
    const act = Number(wallets?.activation ?? 0)
    if (act < amount) throw new HttpsError('failed-precondition', 'Insufficient activation wallet')

    tx.update(uRef, {
      'wallets.activation': act - amount,
      updatedAt: Date.now(),
    })

    const now = Timestamp.now()
    const ends = Timestamp.fromMillis(now.toMillis() + durationDays * 86400000)
    tx.set(apRef, {
      userId: beneficiaryUid,
      packageId,
      amount,
      roiPercent,
      durationDays,
      startedAt: now,
      endsAt: ends,
      nonWorkingPaid: 0,
      workingPaid: 0,
      status: 'active',
      planType: planLabel,
      purchasedByUid: uid,
    })
  })

  // Sponsor bonus (direct) — beneficiary’s sponsor
  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const sponsorPct = Number(settingsSnap.data()?.sponsorPercent ?? 5)
  const beneForSponsor = await db.collection(COL_USERS).doc(beneficiaryUid).get()
  const sponsorUid = beneForSponsor.data()?.sponsorUid as string | undefined
  if (sponsorUid) {
    const bonus = (amount * sponsorPct) / 100
    await db
      .collection(COL_USERS)
      .doc(sponsorUid)
      .set(
        {
          'wallets.cash': FieldValue.increment(bonus),
          sponsorBonusTotal: FieldValue.increment(bonus),
          workingIncomeBalance: FieldValue.increment(bonus),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
    await db.collection('sponsorBonuses').add({
      userId: sponsorUid,
      fromUserId: beneficiaryUid,
      amount: bonus,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await audit(uid, 'activatePackage', {
    packageId,
    amount,
    beneficiaryUid,
    planType: planLabel,
  })
  return { activePackageId: apRef.id }
})

export const createWithdrawal = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    amount?: number
    address?: string
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const address = data.address != null ? String(data.address).trim() : ''
  const transactionPassword =
    data.transactionPassword !== undefined && data.transactionPassword !== null
      ? String(data.transactionPassword)
      : ''

  if (!amount || amount <= 0 || !address || address.length < 10) {
    throw new HttpsError('invalid-argument', 'Invalid withdrawal')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const minW = Number(settingsSnap.data()?.minWithdrawal ?? 25)
  const feePct = Number(settingsSnap.data()?.withdrawFeePercent ?? 10)
  if (amount < minW) {
    throw new HttpsError('invalid-argument', `Minimum withdrawal ${minW}`)
  }

  const fee = (amount * feePct) / 100
  const net = amount - fee

  const wRef = db.collection(COL_WITHDRAWALS).doc()
  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    const cash = Number(uSnap.data()?.wallets?.cash ?? 0)
    if (cash < amount) throw new HttpsError('failed-precondition', 'Insufficient cash')

    tx.update(uRef, {
      'wallets.cash': cash - amount,
      totalWithdrawn: FieldValue.increment(amount),
      updatedAt: Date.now(),
    })
    tx.set(wRef, {
      userId: uid,
      amountGross: amount,
      fee,
      amountNet: net,
      address,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  await audit(uid, 'createWithdrawal', { amount, address })
  return { withdrawalId: wRef.id }
})

export const walletConvert = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const { from, to, amount } = request.data as {
    from?: 'deposit' | 'activation' | 'cash'
    to?: 'deposit' | 'activation' | 'cash'
    amount?: number
  }
  if (!from || !to || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid conversion')
  }
  const allowed =
    (from === 'deposit' && to === 'activation') || (from === 'activation' && to === 'cash')
  if (!allowed) {
    throw new HttpsError('failed-precondition', 'Conversion path not permitted')
  }

  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    const wallets = uSnap.data()?.wallets as Record<string, number>
    const a = Number(wallets?.[from] ?? 0)
    if (a < amount) throw new HttpsError('failed-precondition', 'Insufficient balance')
    tx.update(uRef, {
      [`wallets.${from}`]: a - amount,
      [`wallets.${to}`]: Number(wallets?.[to] ?? 0) + amount,
      updatedAt: Date.now(),
    })
  })

  await audit(uid, 'walletConvert', { from, to, amount })
})

/**
 * Move USDT from caller’s cash (income) wallet to a member’s activation wallet — Ki “Convert” form.
 * Beneficiary must be the caller or a direct referral. Requires transaction PIN when set on profile.
 */
export const convertIncomeToActivation = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    beneficiaryUsername?: string
    amount?: number
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const beneRaw = String(data.beneficiaryUsername ?? '').trim().toLowerCase()
  const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : ''

  if (!beneRaw || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter UserID and a valid amount')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID')
  const beneficiaryUid = mapSnap.data()!.uid as string

  if (beneRaw !== callerUsername) {
    const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get()
    if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')
    const sponsorOfBene = beneSnap.data()?.sponsorUid as string | undefined
    if (sponsorOfBene !== uid) {
      throw new HttpsError('permission-denied', 'You can only convert for yourself or your direct referrals')
    }
  }

  await db.runTransaction(async (tx) => {
    const callerRef = db.collection(COL_USERS).doc(uid)
    const beneRef = db.collection(COL_USERS).doc(beneficiaryUid)

    const cSnap = await tx.get(callerRef)
    const bSnap = await tx.get(beneRef)
    if (!cSnap.exists || !bSnap.exists) throw new HttpsError('not-found', 'User missing')

    const cash = Number(cSnap.data()?.wallets?.cash ?? 0)
    if (cash < amount) throw new HttpsError('failed-precondition', 'Insufficient income (cash) balance')

    const cWallets = cSnap.data()?.wallets as Record<string, number> | undefined
    const bWallets = bSnap.data()?.wallets as Record<string, number> | undefined

    if (beneficiaryUid === uid) {
      tx.update(callerRef, {
        'wallets.cash': cash - amount,
        'wallets.activation': Number(cWallets?.activation ?? 0) + amount,
        updatedAt: Date.now(),
      })
    } else {
      tx.update(callerRef, {
        'wallets.cash': cash - amount,
        updatedAt: Date.now(),
      })
      tx.update(beneRef, {
        'wallets.activation': Number(bWallets?.activation ?? 0) + amount,
        updatedAt: Date.now(),
      })
    }
  })

  await audit(uid, 'convertIncomeToActivation', { amount, beneficiaryUid, beneficiaryUsername: beneRaw })
})

/**
 * Peer transfer: caller’s activation wallet → recipient’s activation wallet (Ki Transfer form).
 * Recipient must be a direct referral (sponsor chain), not self.
 */
export const internalTransfer = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    recipientUsername?: string
    amount?: number
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const recipRaw = String(data.recipientUsername ?? '').trim().toLowerCase()
  const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : ''

  if (!recipRaw || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter recipient UserID and amount')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  if (recipRaw === callerUsername) {
    throw new HttpsError('invalid-argument', 'Choose a team member UserID to transfer to')
  }

  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(recipRaw).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID')
  const recipientUid = mapSnap.data()!.uid as string

  const beneSnap = await db.collection(COL_USERS).doc(recipientUid).get()
  if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')
  const sponsorOfRecip = beneSnap.data()?.sponsorUid as string | undefined
  if (sponsorOfRecip !== uid) {
    throw new HttpsError('permission-denied', 'You can only transfer to your direct referrals')
  }

  const transferRef = db.collection(COL_INTERNAL).doc()

  await db.runTransaction(async (tx) => {
    const senderRef = db.collection(COL_USERS).doc(uid)
    const recipRef = db.collection(COL_USERS).doc(recipientUid)
    const sSnap = await tx.get(senderRef)
    const rSnap = await tx.get(recipRef)
    if (!sSnap.exists || !rSnap.exists) throw new HttpsError('not-found', 'User missing')

    const sAct = Number(sSnap.data()?.wallets?.activation ?? 0)
    if (sAct < amount) throw new HttpsError('failed-precondition', 'Insufficient activation wallet')

    const rAct = Number(rSnap.data()?.wallets?.activation ?? 0)

    tx.update(senderRef, {
      'wallets.activation': sAct - amount,
      updatedAt: Date.now(),
    })
    tx.update(recipRef, {
      'wallets.activation': rAct + amount,
      updatedAt: Date.now(),
    })

    tx.set(transferRef, {
      userId: uid,
      recipientUid,
      amount,
      fromWallet: 'activation',
      toWallet: 'activation',
      fromUsername: callerUsername,
      toUsername: recipRaw,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  await audit(uid, 'internalTransfer', { amount, recipientUid, recipientUsername: recipRaw })
})

/**
 * Approve / reject (refund) / mark paid withdrawals. Reject only from `pending` refunds cash + totalWithdrawn.
 */
export const adminWithdrawalUpdate = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as {
    withdrawalId?: string
    next?: 'processing' | 'approved' | 'rejected' | 'paid'
    txHash?: string
  }
  const withdrawalId = String(data.withdrawalId || '').trim()
  const next = data.next
  const txHash = data.txHash != null ? String(data.txHash).trim() : ''

  if (!withdrawalId || !next) {
    throw new HttpsError('invalid-argument', 'withdrawalId and next are required')
  }

  const ref = db.collection(COL_WITHDRAWALS).doc(withdrawalId)
  const mailbox: { userId: string; title: string; body: string }[] = []

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Withdrawal not found')
    const d = snap.data()!
    const cur = String(d.status || '')
    const uid = String(d.userId)
    const gross = Number(d.amountGross ?? 0)

    if (next === 'rejected') {
      if (cur !== 'pending' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Only pending or processing withdrawals can be rejected')
      }
      tx.update(ref, {
        status: 'rejected',
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      tx.update(db.collection(COL_USERS).doc(uid), {
        'wallets.cash': FieldValue.increment(gross),
        totalWithdrawn: FieldValue.increment(-gross),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal rejected',
        body: `${gross} USDT was returned to your cash wallet.`,
      })
      return
    }

    if (next === 'processing') {
      if (cur === 'processing') {
        throw new HttpsError('failed-precondition', 'Withdrawal is already processing')
      }
      if (cur !== 'pending' && cur !== 'approved') {
        throw new HttpsError(
          'failed-precondition',
          'Only pending or approved withdrawals can be marked processing',
        )
      }
      tx.update(ref, {
        status: 'processing',
        processingAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal processing',
        body: 'Your withdrawal is being processed for payout.',
      })
      return
    }

    if (next === 'approved') {
      if (cur !== 'pending' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Only pending or processing withdrawals can be approved')
      }
      tx.update(ref, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal approved',
        body: 'Your withdrawal is approved and will be processed for payout.',
      })
      return
    }

    if (next === 'paid') {
      if (cur !== 'pending' && cur !== 'approved' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Withdrawal must be pending, approved, or processing')
      }
      if (!txHash) {
        throw new HttpsError('invalid-argument', 'txHash is required to mark paid')
      }
      tx.update(ref, {
        status: 'paid',
        txId: txHash,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal paid',
        body: `Sent. TX: ${txHash}`,
      })
      return
    }

    throw new HttpsError('invalid-argument', 'Invalid next status')
  })

  const note = mailbox[0]
  if (note) {
    await db.collection('notifications').add({
      userId: note.userId,
      title: note.title,
      body: note.body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await audit(actorUid, 'adminWithdrawalUpdate', { withdrawalId, next })
  return { ok: true }
})

/**
 * Admin approves/rejects a deposit. Approval credits `wallets.deposit` in the same transaction as the status flip
 * (fixes missed credits when only Firestore was updated from the console or an older client).
 * Idempotent: repeats do not double-credit when `walletCreditApplied` is already true.
 */
export const adminFinalizeDeposit = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { depositId?: string; decision?: string; adminNote?: string | null }
  const depositId = String(data.depositId ?? '').trim()
  const decision = String(data.decision ?? '').trim().toLowerCase()
  const rawNote = data.adminNote != null ? String(data.adminNote).trim() : ''
  const notePatch = rawNote.length > 0 ? { adminNote: rawNote } : {}

  if (!depositId) {
    throw new HttpsError('invalid-argument', 'depositId is required')
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new HttpsError('invalid-argument', 'decision must be approved or rejected')
  }

  const depRef = db.collection(COL_DEPOSITS).doc(depositId)

  if (decision === 'rejected') {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(depRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Deposit not found')
      const d = snap.data()!
      const cur = String(d.status ?? '')
        .trim()
        .toLowerCase()
      if (cur !== 'pending') {
        throw new HttpsError('failed-precondition', 'Only pending deposits can be rejected')
      }
      tx.update(depRef, {
        status: 'rejected',
        reviewedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
    })
    await audit(actorUid, 'adminDepositRejected', { depositId })
    return { ok: true, credited: 0 }
  }

  let notifyUserId = ''
  const creditedAmount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(depRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Deposit not found')
    const d = snap.data()!
    const cur = String(d.status ?? '')
      .trim()
      .toLowerCase()
    const alreadyCredited = d.walletCreditApplied === true

    if (alreadyCredited && cur === 'approved') {
      return 0
    }

    const amount = Number(d.amount ?? 0)
    const userId = String(d.userId ?? '').trim()
    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('failed-precondition', 'Invalid deposit amount or member id')
    }
    notifyUserId = userId

    const userRef = db.collection(COL_USERS).doc(userId)

    if (cur === 'pending' && alreadyCredited) {
      tx.update(depRef, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return 0
    }

    if (!alreadyCredited) {
      tx.set(
        userRef,
        {
          'wallets.deposit': FieldValue.increment(amount),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
    }

    if (cur === 'pending') {
      tx.update(depRef, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return alreadyCredited ? 0 : amount
    }

    if (cur === 'approved') {
      tx.update(depRef, {
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return alreadyCredited ? 0 : amount
    }

    throw new HttpsError(
      'failed-precondition',
      'Deposit cannot be approved — not pending nor an approved row missing wallet credit.',
    )
  })

  if (creditedAmount > 0 && notifyUserId) {
    await db.collection('notifications').add({
      userId: notifyUserId,
      title: 'Deposit approved',
      body: `${creditedAmount} USDT credited to your deposit wallet`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await audit(actorUid, 'adminFinalizeDeposit', { depositId, decision, creditedAmount })
  return { ok: true, credited: creditedAmount }
})

/** Push the same notification document to every user (batched). */
export const adminBroadcastNotification = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { title?: string; body?: string }
  const title = String(data.title || '').trim()
  const body = String(data.body || '').trim()
  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'Title and body required')
  }

  const snap = await db.collection(COL_USERS).get()
  let total = 0
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    for (const d of docs.slice(i, i + 400)) {
      const ref = db.collection('notifications').doc()
      batch.set(ref, {
        userId: d.id,
        title,
        body,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
      total++
    }
    await batch.commit()
  }

  await audit(actorUid, 'adminBroadcastNotification', { total, title })
  return { sent: total }
})

/** Nightly ROI accrual — explicit region/schedule avoids flaky scheduler deploy (“HTML not JSON”). */
export const processDailyRoi = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  if (settingsSnap.exists && settingsSnap.data()?.roiEnabled === false) {
    return
  }
  const now = Timestamp.now()
  const snap = await db.collection(COL_ACTIVE).where('status', '==', 'active').get()

  for (const docSnap of snap.docs) {
    const ap = docSnap.data()
    const endsAt = ap.endsAt as Timestamp
    if (endsAt.toMillis() < now.toMillis()) {
      await docSnap.ref.set({ status: 'completed', updatedAt: now }, { merge: true })
      continue
    }

    const amount = Number(ap.amount ?? 0)
    const roiPercent = Number(ap.roiPercent ?? 0)
    const userId = String(ap.userId)
    const nonWorkingPaid = Number(ap.nonWorkingPaid ?? 0)
    const cap = amount * 2
    const daily = (amount * roiPercent) / 100
    if (nonWorkingPaid + daily > cap) {
      await docSnap.ref.set({ status: 'capped', updatedAt: now }, { merge: true })
      continue
    }

    const newPaid = nonWorkingPaid + daily
    await docSnap.ref.update({ nonWorkingPaid: newPaid })
    await db
      .collection(COL_USERS)
      .doc(userId)
      .set(
        {
          'wallets.cash': FieldValue.increment(daily),
          dailyProfitsTotal: FieldValue.increment(daily),
          nonWorkingIncomeBalance: FieldValue.increment(daily),
          updatedAt: Date.now(),
        },
        { merge: true },
      )

    await db.collection(COL_DAILY).add({
      userId,
      amount: daily,
      activePackageId: docSnap.id,
      createdAt: FieldValue.serverTimestamp(),
    })
  }
  },
)
