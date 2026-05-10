# Rich Pay Clone

Production-oriented scaffold for a crypto investment and referral (MLM-style) platform: React (Vite) + Tailwind + Firebase (Auth, Firestore, Storage, Functions, Hosting). UI follows a premium black and gold institutional theme with a dashboard sidebar aligned to the specification you provided.

## Prerequisites

- Node.js 20+ (recommended; Cloud Functions target Node 20)
- Firebase CLI (`npm i -g firebase-tools`)
- A Firebase project with Authentication (Email/Password), Firestore, Storage, and Functions enabled

## Quick start (local)

```bash
cd rich-pay-clone
cp .env.example .env
# Fill VITE_* keys from Firebase console → Project settings
npm install
npm run dev
```

Without Firebase env vars, the app shell loads but auth/data/features will not work.

## Firebase configuration

1. Create a web app in Firebase and copy config into `.env` as `VITE_FIREBASE_*`.
2. Enable **Email/Password** sign-in.
3. Deploy rules and indexes:

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

4. Deploy Cloud Functions (after `npm install` inside `functions/`):

```bash
firebase deploy --only functions
```

5. Deploy hosting (after `npm run build`):

```bash
firebase deploy --only hosting
```

### Admin access

Firestore rules expect **custom claims** for privileged client writes (e.g. `siteSettings` from the admin UI):

- `request.auth.token.admin == true`

Grant the claim for your admin user (replace UID) using the Admin SDK or Firebase CLI extension. Example (Node, service account JSON on `GOOGLE_APPLICATION_CREDENTIALS`):

```js
const admin = require('firebase-admin')
admin.initializeApp()
admin.auth().setCustomUserClaims('<ADMIN_UID>', { admin: true })
```

Then set `role: 'admin'` on the corresponding `users/{uid}` document for UI routing consistency.

### Callable functions (registration & money movement)

| Function              | Purpose                                      |
|-----------------------|----------------------------------------------|
| `registerWithProfile` | Creates Auth user, numeric username from counter starting at `4448550`, sponsor link, phone index |
| `activatePackage`     | Deducts activation wallet, creates `activePackages`, pays direct sponsor % from settings |
| `createWithdrawal`    | Validates min/fee, debits cash wallet, creates pending withdrawal |
| `walletConvert`       | `deposit → activation` or `activation → cash` |
| `onDepositApproved`   | Firestore trigger: pending → approved credits deposit wallet |
| `processDailyRoi`     | Scheduled: daily ROI to cash wallet with 2× non-working cap on package |

Extend the same file for: team-level distribution (30 levels), rank rewards, withdrawal rejection refunds, transfer fees, and strict working (3×) caps.

## Firestore collections

As defined in your brief: `users`, `counters`, `packages`, `activePackages`, `deposits`, `topups`, `withdrawals`, `walletTransactions`, `internalTransfers`, `dailyProfits`, `sponsorBonuses`, `teamLevelBonuses`, `rankBonuses`, `ranks`, `teamLevels`, `tickets`, `ticketReplies`, `notifications`, `cmsPages`, `siteSettings`, `seoSettings`, `auditLogs`, plus `usersByUsername` and `phoneIndex` for lookups.

Seed example `siteSettings/config` and at least one `packages/{id}` with `active: true` for top-ups to appear in the member UI.

## Security notes

- User documents are **read-only from the client**; all financial writes should go through Cloud Functions or Admin SDK.
- Tighten Storage rules and add App Check before production.
- Rate limiting: add App Check + Cloud Functions quotas / reCAPTCHA as needed.

## Testing checklist

- [ ] `.env` populated; `npm run dev` loads landing and admin styling
- [ ] `registerWithProfile` creates user with expected username sequence
- [ ] Referral URL ` /register?ref=4448550` locks / prefills sponsor fields
- [ ] Deposit request + Storage upload succeeds under `deposits/{uid}/...`
- [ ] Admin approves deposit → deposit wallet increases (`onDepositApproved`)
- [ ] Package top-up debits activation and creates `activePackages`
- [ ] Scheduled ROI runs (use emulator or short test schedule in dev)
- [ ] Withdrawal debits cash and creates pending doc
- [ ] Custom admin claim: `/admin` routes and `siteSettings` save work
- [ ] `npm run build` succeeds; `firebase deploy --only hosting` serves SPA routes
- [ ] Mobile: sidebar drawer, landing sections, forms usable at 375px width

## Legal

This repository is a technical scaffold. Operate any live investment or referral program only with appropriate licensing, disclosures, and legal review in your jurisdiction.
