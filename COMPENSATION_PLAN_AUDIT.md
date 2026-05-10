# Rich Pay — Compensation plan audit (PDF vs implementation)

Reference: **RICH PAY.pdf was not attached to this repository**; this audit uses the tier table and rules you specified in the task description as the authoritative plan.

Legend: **OK** implemented | **PART** partial | **GAP** missing / backlog

---

## STEP 9 — Compatibility matrix

| PDF rule | Status | Notes |
|----------|--------|--------|
| Tier 1–5 ($100–$500), daily ROI 1–5%, durations 200/100/66/50/40, total 200% | **PART → OK** | Tiers live in **`packages`** (admin-managed). **Admin → Packages → “Seed PDF five tiers”** writes the canonical rows. Pricing/ROI otherwise match prior dynamic model. |
| Daily ROI paid to income (non‑working bucket) until 2× cap | **OK** | `processDailyRoi` uses **`frozenNonWorkingCapMultiplier`** (from package **`maxRoiMultiplier`**, fallback site **`nonWorkingIncomeCapMultiplier`**) and **`planSnapshot.roiPercent`**. |
| 5% direct sponsor bonus | **OK** | Taken from **`siteSettings.sponsorPercent`** at activation, stored in **`planSnapshot`**, and paid inside **`payWorkingIncomeForActivation`**. Editable via **Admin → Sponsor**. |
| 30‑level team profit | **OK** | Frozen **`teamLevels`** in **`planSnapshot`** + sponsor walk; qualifies when **`activeDirects >= requiredDirects`**. **`activeDirects`** = count of directs with ≥1 **`active`** package (bump first activation / drop when last active ends). **`conditionDescription`** stored for ledger display. Working cap unchanged. |
| Rank rewards (sequential drip) | **OK** | **`users.rankCompensationSnapshot`** captures ranks + ratio at activation; **`processDailyRankRewards`** runs **`processRankRewardForUser`** (03:30 UTC). One daily credit per payout day until **`rewardDurationDays`**; then next rank only after completion. Ratio: **`rankQualificationPowerPercent` / `rankQualificationRestPercent`** (+ TB split via **`propagateTeamBusinessVolume`**). Toggle: **`rankRewardsEnabled`**. |
| Non‑working cap 2× | **OK** | Default non‑working multiplier **2**; overridable per package via **`maxRoiMultiplier`**, or globally **Admin → Wallet Settings → Non‑working ROI cap**. |
| Working cap 3× | **OK** | Sponsor + team payouts for a given activation share **`amount × workingIncomeCapMultiplier`** (default **3**). Stored as **`frozenWorkingCapMultiplier`** + snapshot. |
| Withdrawals: min, fee, admin approval, paid + tx id | **PART** | Min/fee from **live** `siteSettings` in **`createWithdrawal`**. **Admin → Withdrawals** handles status (existing). **Snapshot** stores min/fee at activation for audit only; **not** used to vary withdrawal rules per historical package (would need larger withdrawal refactor). |
| Referral / sponsor chain | **OK** | Registration + `sponsorUid` / `usersByUsername` unchanged. |
| Compounding plan type | **PART** | UI sends `planType: compounding`; **`processDailyRoi`** still accrues like daily to cash (no internal compounding bucket). Backlog: branch accrual for compounding. |
| “All income types” universal admin schema | **GAP** | Current design uses **separate** admin modules (packages, sponsor, team levels, ranks, wallet, ROI) — appropriate for this codebase. A single generic “income type registry” would duplicate those modules; not added per **no duplicates** instruction. |
| Manual credit/debit, promo, conversion bonus types | **GAP** | No dedicated ledgers; **`walletConvert`** + existing wallets only. Extend later via **admin callables** if required. |

---

## Firestore / schema

| Location | Change |
|----------|--------|
| **`activePackages`** | **`planSnapshot`** (immutable object), **`frozenNonWorkingCapMultiplier`**, **`frozenWorkingCapMultiplier`**. **`workingPaid`** = cumulative sponsor+team paid under the 3× cap for that activation. |
| **`siteSettings/config`** | **`nonWorkingIncomeCapMultiplier`**, **`workingIncomeCapMultiplier`**, **`rankRewardsEnabled`**, **`rankQualificationPowerPercent`**, **`rankQualificationRestPercent`**, **`planSettingsVersion`**. |
| **`rankBonuses`** | **`dayKey`**, **`rankId`**, **`rankName`**, **`payoutSequenceDay`**, **`payoutDaysTotal`**, **`scheduledPayout`**, **`transactionType`** (e.g. `Ranking Bonus`) for drip idempotency. |
| **`users`** | **`powerTeamBusiness`**, **`restTeamBusiness`**, **`rankCompensationSnapshot`** (frozen team levels + ranks + ratio), **`rankReward*`** drip fields, **`completedRankRewardIds`**. |
| **`sponsorBonuses` / `teamLevelBonuses`** | Optional **`activePackageId`** on new rows (older rows may omit). |

---

## Cloud Functions

| Function | Change |
|----------|--------|
| **`activatePackage`** | Builds **full snapshot** (schema v2 incl. ranks + TB ratio + **`teamLevels`**), **`propagateTeamBusinessVolume`**, updates **`rankCompensationSnapshot`** on beneficiary, sponsor **`activeDirects`** rules, **`payWorkingIncomeForActivation`**. |
| **`adminSeedCompensationDefaults`** | Admin **`onCall`** — inserts **`REFERENCE_*_SEED`** rows when doc ids absent. |
| **`processDailyRoi`** | ROI % and **2×** cap read from **snapshot / frozen fields** so **legacy `activePackages` without `planSnapshot` still work** (fallback to top‑level `roiPercent` and multiplier **2**). |
| **`processDailyRankRewards`** | Paginates **users** → **`processRankRewardForUser`**: sequential rank schedules, capped duration, **`rankBonuses`** idempotency. Toggle: **`rankRewardsEnabled`**. |

---

## Admin UI (existing pages only)

| Page | Update |
|------|--------|
| **Package Management** | **Seed PDF five tiers**, **Clone** tier. |
| **Wallet Settings** | Income cap multipliers (non‑working / working) + version bump. |
| **Sponsor** | Save bumps **planSettingsVersion**. |
| **ROI Settings** | Toggle **rank reward** scheduler + version bump. |
| **Rank Bonus Settings** | Power/rest ratio (**`rankQualification*`**), full rank CRUD (**`sortOrder`**, **`totalReward`**), seed reference giants. |
| **Team Level Settings** | **`conditionDescription`**, bulk range tool, seed reference matrix. |
| **Site Settings** | Bumps version when **sponsor %** or **team level depth** changes. |
| **Team levels / Ranks** | Call **`bumpPlanSettingsVersion`** on create/update/delete/toggle. |

---

## Versioning (STEP 6–7)

- **Existing `activePackages`**: Keep using **stored** `planSnapshot` + frozen multipliers for ROI; older rows without snapshot use **legacy fallbacks** (same behaviour as before for ROI).
- **New activations**: Snapshot captured at purchase; **live** admin changes do not alter past rows.
- **`planSettingsVersion`**: Incremented on compensation‑related admin saves to correlate snapshot metadata (`planSettingsVersionAtCapture`).

---

## PDF file

**`RICH PAY.pdf` was not found under the repo path.** If you add it to the project, re‑run a legal/compliance review; numerics above already match the tier list from your prompt.
