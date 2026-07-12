# DirectHire Technical Architecture Document v2.0

**Status:** Reflects the actual codebase as of this document's generation. Replaces the v1.0 aspirational architecture doc. Every claim below is verified against real files — where v1.0 described something that was never built (NestJS, AWS, an escrow system), that is called out explicitly rather than silently dropped.

**Audience:** Investors performing technical due diligence, and engineers onboarding onto the codebase.

---

## 1. Platform Overview

DirectHire is an AI-assisted global job marketplace connecting three roles — **workers** (job seekers, primarily blue-collar/service roles across borders), **employers** (companies hiring internationally), and **admins** (platform operators who gate every account and job post before it goes live). The core differentiators as actually implemented are: a deterministic weighted match-scoring algorithm (not a black-box model — see §3), a "Worker Lock" paid-reservation mechanism that lets an employer exclusively hold a candidate for a period, and an admin-mediated trust layer where nothing (account, job post, document) becomes visible to the other side without human review.

### What v1.0 claimed vs. what is actually built

| Area | v1.0 (aspirational) | Actual (v2.0, verified) |
|---|---|---|
| Backend framework | NestJS | **Express** (`backend/src/server.ts`), plain controllers/routes, no DI container |
| Cloud provider | AWS | **Railway** (backend), **Vercel** (frontend) |
| Database | — | **Supabase Postgres** (pooled `DATABASE_URL` via pgbouncer + direct `DIRECT_URL` for migrations) |
| File storage | — | **Supabase Storage** (private bucket, signed URLs — see §7) |
| Payments | Escrow system | **Stripe** — subscriptions (employer access) + one-off PaymentIntents (Worker Lock, application fees). No escrow; DirectHire never holds worker/employer funds in trust — it charges platform fees directly. |
| Email | — | **Resend** (primary), SMTP fallback, console provider for local dev |
| Background jobs | — | **BullMQ** for scheduled/repeat jobs; ad-hoc jobs (email sends, match notifications) run **inline in the request process** by default (`JOBS_INLINE_MODE=true`) — see §8 for the real state of the BullMQ path |

### Deployed topology

```
Browser
  │
  ▼
www.directhire.cc  (Vercel — Next.js 14.2, App Router)
  │
  │  every /api/* request is rewritten (next.config.js), not redirected —
  │  the browser always talks to www.directhire.cc, so auth cookies never
  │  cross an origin boundary
  ▼
api.directhire.cc  (Railway — Express, Node/TypeScript, single process)
  │
  ├── Supabase Postgres  (DATABASE_URL pooled / DIRECT_URL direct-for-migrations)
  ├── Supabase Storage   (private bucket "directhire-uploads", signed URLs)
  ├── Stripe             (subscriptions, Worker Lock charges, application fees)
  ├── Resend             (transactional + reminder email)
  └── Redis (optional)   (BullMQ — see §8 for which queue actually has a live worker)
```

`frontend/next.config.js` proxies `/api/:path*` to `NEXT_PUBLIC_API_URL` unconditionally — this single rewrite rule is why the single-cookie auth design in §7 works at all in production (see the Set-Cookie note there).

---

## 2. Role Workflows

### Worker journey

1. **Registration** — `POST /api/auth/register` (`auth.controller.ts`), `role: "WORKER"`. Creates `User` (`status: PENDING_VERIFICATION`, `accountStatus: PENDING_EMAIL_VERIFICATION`), a stub `WorkerProfile`, an `OnboardingProgress` row (`totalSteps: 7`), and a `VerificationRecord` (`reviewStatus: PENDING`) — all in one transaction. Requires an explicit consent checkbox (`acceptedTerms`), persisted as `User.consentAcceptedAt` + `consentPolicyVersion`. An OTP is emailed for email verification (`VerificationCode`, `EMAIL_VERIFICATION` type, 10-minute expiry).
2. **Multi-step onboarding** — `POST /api/onboarding/save-step` per step, autosaved via the frontend Zustand store (`lib/stores/onboarding.store.ts`). Steps persist into typed `WorkerProfile` fields (name, passport number — encrypted, phone — encrypted, marital status, children, skills, languages, target countries) plus required document uploads (profile photo + at least one of work/intro video). `POST /api/onboarding/submit` enforces the upload requirement, flips `OnboardingProgress.onboardingStatus` to `SUBMITTED`, `User.status` to `PENDING_VERIFICATION`, `VerificationRecord.reviewStatus` to `PENDING`, and fires both an email (`ADMIN_NEW_SUBMISSION`) and an in-app admin notification.
3. **Admin verification** — two independent gates, both must pass: (a) `POST /api/admin/review` — the account-level approve/reject/needs-changes decision (`admin.controller.ts:review`), which on approval sets `accountStatus: VERIFIED` and `WorkerProfile.isSearchable: true`; (b) document-level review (`admin-documents.controller.ts:reviewWorkerDocuments`) — a photo/video/passport batch decision. Both write to `AdminAuditLog`.
4. **Browse & apply** — `GET /api/jobs` (worker.controller.ts) returns `APPROVED` job posts with a live-computed `matchScore` per job (§3). `POST /api/jobs/:id/apply` computes a dynamic application fee (§4) via Stripe PaymentIntent, then `POST /api/jobs/:jobId/apply/confirm` finalizes the `Application` row (`status: APPLIED`).
5. **Application lifecycle** — employer views (auto-transitions to `VIEWED`) → `SHORTLISTED` → `INTERVIEWED` (unlocks employer contact details for the worker) → worker responds via `POST /applications/:id/interview-response` (`ACCEPTED`/`DECLINED`, independent of `status`) → employer accepts (`ACCEPTED`, terminal) or rejects (`REJECTED`, terminal) at any non-terminal stage. Worker may `WITHDRAWN` while `APPLIED`/`VIEWED`.
6. **Hire** — `ACCEPTED` triggers `sendHireConfirmationEmployerEmail` / `sendApplicationAcceptedWorkerEmail`. No further platform-mediated step (no escrow, no in-app contract signing).

### Employer journey

1. **Registration** — same endpoint, `role: "EMPLOYER"`, `totalSteps: 6`. Frontend collects company details, NIPT/business ID, contact phone (encrypted — same silent-drop bug class as worker phone, fixed this cycle), hiring countries/skills, plan selection.
2. **Subscription gate** — `requireSubscription` middleware (`subscription.middleware.ts`) checks `EmployerProfile.subscriptionStatus === "ACTIVE"` and `subscriptionCurrentPeriodEnd` not expired; on failure returns `403` with `code: "SUBSCRIPTION_REQUIRED"` and `redirectTo: "/employer/subscription"`. Checkout is `POST /employer/subscription/checkout` (Stripe Checkout, single recurring price via `STRIPE_EMPLOYER_PRICE_ID`); status is kept in sync via the Stripe webhook (`webhook.controller.ts`). Reading your own jobs/applications is **not** gated; creating/editing/submitting jobs and locking workers **is**.
3. **Job posting** — `POST /employer/jobs` (`employer-jobs.controller.ts`), starts `DRAFT`, `POST /jobs/:id/submit` moves to `PENDING_MODERATION` and fires `notifyAdminsNewJob` (in-app + the pre-existing email path).
4. **Admin moderation** — `admin-jobs.controller.ts`: `approveJob` (→ `APPROVED`, live on the feed, triggers the job-match notification fan-out — §3), `rejectJob`, `requestJobChanges` (→ employer can resubmit), `archiveJobAdmin`. Every action appends to `JobPost.moderationHistory` (JSON) and writes `AdminAuditLog`.
5. **Candidate review** — `GET /employer/workers` (search/browse, requires subscription), `employer-applications.controller.ts` for reviewing applications against a specific job post, with the same status transition matrix as above enforced server-side (`ALLOWED_TRANSITIONS` map — illegal transitions rejected outright, not just hidden in the UI).
6. **Lock** — `POST /employer/workers/:workerId/lock` (§4) reserves a worker exclusively; `hire` is simply accepting the application while the lock is (optionally) active.

### Admin journey

Verification queues (`/admin/users/pending`, `/admin/approvals`), document review (`/admin/document-review`), job moderation (`/admin/jobs/pending`, `/admin/jobs`), lock monitor (`/admin/locks` — built this cycle), revenue dashboard (`/admin/revenue`), audit log (`/admin/audit-log`), email logs (`/admin/email-logs`), and a "Fraud Console" nav entry that currently has **no backing route** in `admin.routes.ts` — decorative until fraud scoring (§10) is built.

### Real status enums (verbatim from `schema.prisma`)

```
OnboardingStatus:  DRAFT | IN_PROGRESS | SUBMITTED | PENDING_REVIEW | APPROVED | REJECTED | NEEDS_CHANGES
AccountStatus:     PENDING_EMAIL_VERIFICATION | PENDING_REVIEW | VERIFIED | REJECTED | SUSPENDED
ApplicationStatus: APPLIED | VIEWED | SHORTLISTED | INTERVIEWED | ACCEPTED | REJECTED | WITHDRAWN
JobPostStatus:     DRAFT | PENDING_MODERATION | APPROVED | REJECTED | ARCHIVED
LockStatus:        ACTIVE | EXPIRED | RELEASED | OVERRIDDEN
```

Note `UserStatus` (`ACTIVE|SUSPENDED|BANNED|PENDING_VERIFICATION`) and `AccountStatus` are two **separate** fields on `User` — `status` is the legacy/coarse field, `accountStatus` is the one every current auth/gating check actually reads. Both exist; keeping them in sync is manual per-endpoint discipline, not enforced by the schema.

---

## 3. AI Matching

The match score is a deterministic weighted formula — not an ML model, no training data, no external inference call. Source: `backend/src/services/matching/index.ts`.

```
Score = (S_skill × 0.30) + (S_exp × 0.20) + (S_sal × 0.15)
      + (S_loc  × 0.15) + (S_trust × 0.15) + (S_dem × 0.05)
```

(`services/matching/index.ts:104-124`, `calculateMatchScore`)

| Sub-score | Weight | Logic |
|---|---|---|
| `S_skill` | 30% | Jaccard-style overlap between worker skills and job's `requiredSkills`; 100 if the job requires none |
| `S_exp` | 20% | 100 if years match exactly, 70 within 2 years, 40 within 5 years; beyond a 5-year gap, 0 unconditionally (`matching/index.ts:53-56` — there's an explicit "less than half the required years" check before the fallback, but it's redundant: the function returns 0 either way once the gap exceeds 5 years) |
| `S_sal` | 15% | 100 if worker's expected salary falls within `[salaryMin, salaryMax]`; 60 for up to 20% *above* max; 80 for up to 20% *below* min; 20 outside that band entirely; 50 if worker hasn't set an expectation |
| `S_loc` | 15% | 100 if the job's country is in the worker's target countries, 80 if it's their current country of residence, else 0 |
| `S_trust` | 15% | Direct pass-through of `WorkerProfile.trustScore` (0–100), defaulting to 50 when unset |
| `S_dem` | 5% | **Hardcoded constant `50`** — no regional demand signal exists yet (`matching/index.ts:113`, commented "MVP constant — no regional demand data yet") |

### Where it's applied

1. **Worker feed** (`worker.controller.ts:getJobs`/`getJob`) — computed live, per request, for every job on the current page. `sort=match` re-sorts the *already-fetched page* in memory — this is a documented, deliberate limitation: a better match sitting on page 2 will not bubble to page 1, because there is no precomputed score table to sort against globally. Fixing this would require a scores table refreshed out of band, explicitly deferred.
2. **Job-approval notification fan-out** (`queue/index.ts:notifyMatchingWorkersForApprovedJob`) — when an admin approves a job post, every `VERIFIED` worker with a profile is scored against it; the top 20 scoring ≥70 get an in-app `JOB_MATCH` notification ("New job matches your profile — X% match"). Runs as a background job (`enqueue("scoring.calculateMatchScores", ...)`, never awaited by the approval request).
3. **Nightly recalculation** (`services/scoring-jobs/index.ts:runMatchScoreRecalc`, 02:15 UTC) — refreshes the *stored* `Application.matchScore` for applications still in `APPLIED`/`VIEWED`/`SHORTLISTED` whose job or worker profile changed since the job's own last successful run (tracked via `JobRunLog`). This is deliberately **not** a full worker×job score matrix — it only touches applications that already exist, closing the "score goes stale after the fact" gap without building unbounded background compute.

### What is honestly not built

- **No fraud/risk scoring.** `WorkerProfile.riskScore` exists in the schema and is displayed in the admin submissions list, but nothing ever writes to it. The `fraud.analyzeUser` job type is declared in `queue/index.ts`'s `JobName` union but has no processor — dead code, same as `scoring.calculateWorkerScore`.
- **No feedback loop.** Match scores are never validated against actual outcomes (did a high-match application get accepted more often?). `AiDecisionLog` — a schema table shaped exactly for this (`inputData`/`outputData`/`score`/`confidence`/`modelVersion`) — is never written to anywhere in `backend/src`. Pure scaffolding.
- Both are listed honestly in §10, not silently omitted.

---

## 4. Dynamic Pricing

### Application fee (`services/pricing/index.ts`)

```
rawFee = baseFee × RegionDemandMultiplier × SalaryTierMultiplier × ConversionAdj
fee    = round_to_nearest_50¢( clamp(rawFee, $1.00, $25.00) )
```

- **Base fee**: admin-configurable via `PlatformConfig` key `application_base_fee_cents` (default 300¢/$3.00, floor 50¢). Set `application_fee_enabled=false` or env `DISABLE_APPLICATION_FEES=true` to waive fees entirely (returns `$0.00`).
- **Region demand multiplier**: `ratio = active APPROVED jobs in country / workers targeting that country`. `ratio > 2 → 2.5×`, `ratio ≥ 1 → 1.5×`, else `1.0×`. Computed live per request, no caching.
- **Salary tier multiplier**: `<$20k → 1.0×`, `<$50k → 1.3×`, `<$100k → 1.5×`, `≥$100k → 1.8×` (based on the job's `salaryMax`).
- **Conversion adjustment**: `(matchScore > 80 AND trustScore > 80) → 0.8×` (discount for strong-fit, trusted applicants); `(matchScore < 40 OR trustScore < 40) → 1.2×` (surcharge); else `1.0×`.

### Worker Lock economics (`worker-lock.controller.ts`, `services/lock-jobs/index.ts`)

An employer can pay to exclusively reserve a worker (blocks other employers from locking/hiring them) for a fixed period.

| Parameter | Default | Admin-configurable via |
|---|---|---|
| Daily rate | $2.00 (200¢) | `PlatformConfig.lock_daily_rate_cents` (`admin-config.controller.ts`) |
| Max duration | 14 days | `lock_max_duration_days` |
| Max concurrent locks / employer | 5 | `lock_max_concurrent` |
| Grace period (stale pending charge) | 24 hours | `lock_grace_period_hours` |

Creating a lock (`POST /employer/workers/:workerId/lock`) requires an active subscription, charges the **entire duration upfront** via a single Stripe PaymentIntent (`dailyRateCents × lockDays`), and is blocked if the worker is already locked, the employer already holds a lock on that worker, or the employer is at their concurrent-lock ceiling.

Two scheduled jobs manage the lock lifecycle (both write `JobRunLog` rows and are individually idempotent):

- **`lock-daily-billing`** (00:05 UTC) — expires any `ACTIVE` lock whose initial PaymentIntent never confirmed within the grace period (creates a `FAILED` `Payment`, clears the worker's lock flags, notifies both sides with a neutral message), and sends 48-hour expiry warnings for locks approaching their `lockExpiryDate`.
- **`lock-expiry-processor`** (hourly at :15) — expires any `ACTIVE` lock past its natural `lockExpiryDate`, records a `$0` `SUCCEEDED` `Payment` marking the natural-expiry event, clears worker flags, notifies both sides.

Admins can also force-release a lock (`POST /admin/locks/:lockId/override`, `lockStatus → OVERRIDDEN`) with a required internal-only reason note — surfaced in `/admin/locks` (§9).

---

## 5. Notification & Email System

### In-app notifications

Single `Notification` model, `NotificationType` enum (24 values — includes two lowercase legacy values, `new_job_pending` and `lock_overridden`, inconsistent with the rest of the enum's UPPER_SNAKE convention but load-bearing, not worth a breaking rename). The controller pattern is **role-agnostic by design**: `worker-notifications.controller.ts`'s handlers (`getNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`) are mounted directly on all three routers (`worker.routes.ts`, `employer.routes.ts`, `admin.routes.ts`) — one implementation, filtered purely by `req.user.sub`, no duplication.

**Event → notification map** (every `prisma.notification.create`/`createMany` call site):

| Event | Type | Recipient | Source |
|---|---|---|---|
| Employer sends worker a message | `MESSAGE_RECEIVED` | Worker | `employer.controller.ts` |
| Worker replies to employer | `MESSAGE_RECEIVED` | Employer | `worker-notifications.controller.ts` |
| Job approved by admin, matches worker ≥70% (top 20) | `JOB_MATCH` | Worker | `queue/index.ts` |
| New job submitted for moderation | `new_job_pending` | Admin(s) | `employer-jobs.controller.ts` |
| Worker submits onboarding for review | `GENERAL` | Admin(s) | `onboarding.controller.ts` |
| Verified worker re-uploads a document | `DOCUMENT_PENDING` | Admin(s) | `uploads.controller.ts` |
| Worker locked / lock extended / released | `WORKER_LOCKED` / `WORKER_LOCK_EXTENDED` / `WORKER_LOCK_RELEASED` | Both parties | `worker-lock.controller.ts` |
| Lock expiry warning / natural expiry | `LOCK_EXPIRY_WARNING` / `LOCK_EXPIRED` | Both parties | `services/lock-jobs/index.ts` |
| Admin force-releases a lock | `lock_overridden` | Both parties | `admin-locks.controller.ts` |
| Job approved/rejected/changes requested | `ADMIN_JOB_MODERATION` | Employer | `admin-jobs.controller.ts` |
| Account approved / rejected / suspended / reinstated | `ACCOUNT_APPROVED` / `ACCOUNT_REJECTED` / `ACCOUNT_SUSPENDED` / `ACCOUNT_REINSTATED` | User | `admin.controller.ts` |
| Application withdrawn | `APPLICATION_UPDATE` | Employer | `worker-applications.controller.ts` |
| Document approved/rejected | `DOCUMENT_APPROVED` / `DOCUMENT_REJECTED` | Worker | `admin.controller.ts` |

### Polling architecture

No websockets — every surface polls, visibility-aware (pauses when the tab is hidden, refetches immediately on refocus) via two hooks: `useNotificationPolling` (unread-count badges, fires immediately + on interval) and the lower-level `useVisibilityPoll` (list refreshes, interval-only, no mount-time fetch since callers already have their own initial load).

| Role | Surface | Polls | Interval | Mechanism |
|---|---|---|---|---|
| Worker | Top bar (all pages) | Unread count | 30s | `useNotificationPolling` |
| Worker | Sidebar nav badge | Unread count | 30s | `useVisibilityPoll` |
| Worker | Sidebar (reservation dot) | Lock status | 5 min | `useVisibilityPoll` |
| Worker | `/worker/applications` | Application list | 60s | `useVisibilityPoll` |
| Worker | `/worker/messages` | Message list | 60s | `useVisibilityPoll` |
| Employer | Header bell | Unread count | 30s | `useNotificationPolling` |
| Employer | Sidebar (active locks) | Lock count | 2 min | `useVisibilityPoll` — **unreachable**: `Sidebar` only mounts for `role==='worker'`; employer uses `DashboardHeader`'s own nav instead (§10) |
| Employer | `/employer/jobs/[id]/applicants` | Applicant list | 60s | `useVisibilityPoll` |
| Employer | `/employer/messages` | Message list | 60s | `useVisibilityPoll` |
| Admin | Header bell | Unread count | 30s | `useNotificationPolling` |
| Admin | Sidebar (pending stats) | Counts | 2 min | `useVisibilityPoll` — same unreachable-`Sidebar` caveat |

### Email

Provider-abstracted (`services/email/index.ts`): `resend` (production), `smtp` (fallback), `console` (dev, no real sends). Every send goes through one `sendEmail()` function that logs to `EmailLog` before attempting delivery and updates its status (`QUEUED → SENT|FAILED`) afterward — this is also the single suppression gate (see below), so no per-template code duplicates the unsubscribe check.

`EmailType` (16 values) splits into:

- **Suppressible (1 type)**: `ONBOARDING_REMINDER` — the only email a user can opt out of.
- **Transactional, always sent (15 types)**: `WELCOME`, `EMAIL_VERIFICATION`, `PASSWORD_RESET`, `ONBOARDING_SUBMITTED`, `ACCOUNT_APPROVED/REJECTED/NEEDS_CHANGES`, `SUBSCRIPTION_CONFIRMED`, `ADMIN_NEW_SUBMISSION`, all 5 `APPLICATION_*` types, `GENERAL`. `GENERAL` is an overloaded catch-all (job moderation, lock lifecycle, posting rights, contact-form receipts, direct messages) — every current call site is transactional, but the type itself doesn't guarantee that for future call sites.

**Unsubscribe**: `User.unsubscribeToken` (random, stored, non-expiring, generated lazily on first need — not a signed JWT, since it needs no expiry and a direct DB lookup is simpler than verification). Public `GET /api/unsubscribe?token=` returns a minimal self-contained HTML confirmation page directly from Express (no separate frontend route), setting `User.emailUnsubscribedAt`.

**Reminder cooldown**: `runOnboardingReminders()` used to re-send daily to anyone stale >24h with zero de-dup. Fixed by reusing `EmailLog` (already records every send with `userId`/`emailType`/`createdAt`) — a `groupBy` query skips anyone reminded within the last 7 days. No new column was needed.

---

## 6. Database Schema

29 models in `prisma/schema.prisma`, grouped by domain:

| Domain | Models |
|---|---|
| Core user & auth | `User`, `Session`, `EmailVerificationToken`, `PasswordResetToken`, `VerificationCode` |
| Worker profile | `WorkerProfile`, `WorkerSkill`, `WorkerLanguage`, `WorkerTargetCountry` |
| Employer profile | `EmployerProfile`, `EmployerHiringCountry`, `EmployerRequiredSkill` |
| Onboarding & verification | `OnboardingProgress`, `VerificationRecord` |
| Uploads | `Upload` |
| Jobs & applications | `JobPost`, `Application`, `SavedJob` |
| Worker Lock | `WorkerLock`, `LockBillingCharge` |
| Messaging & notifications | `Message`, `Notification` |
| Email | `EmailLog` |
| Audit & compliance | `AuditLog`, `AdminAuditLog` |
| AI scaffolding (unused) | `AiDecisionLog` |
| Scheduled jobs | `JobRunLog` |
| Payments & config | `Payment`, `PlatformConfig` |

### Relations and cascade rules — now real

Every `User`-rooted relation in `schema.prisma` correctly declares `onDelete: Cascade` (or `SetNull` where appropriate, e.g. `Upload.reviewedBy`). This was **not** actually enforced in the live database until this cycle: a direct `pg_constraint` query found `WorkerProfile`, `EmployerProfile`, and `Upload`'s `userId` foreign keys — plus `WorkerSkill`/`WorkerLanguage`/`WorkerTargetCountry`/`EmployerHiringCountry`/`EmployerRequiredSkill`'s parent-profile foreign keys — **entirely missing** from the live database despite being declared correctly in both `schema.prisma` and the original init migration. Account deletion had been silently leaving orphaned rows (13 `WorkerProfile`, 2 `EmployerProfile`, 8 `Upload` rows found on audit) for an unknown period. Fixed via migration `20260710000000_fix_orphaned_profile_upload_fks`, using `ADD CONSTRAINT ... NOT VALID` (enforces going forward immediately, doesn't require pre-cleaning existing orphans to deploy) plus a companion sweep script and a deferred `VALIDATE CONSTRAINT` step. **8 more tables** with a `userId` column still lack their FK and haven't been individually orphan-audited — flagged, not fixed (§7, §10).

### Encrypted fields

AES-256-GCM via `lib/encrypt.ts` (base64url-encoded ciphertext, 12-byte random IV per value, single 32-byte key from `ENCRYPTION_KEY` env var):

- `WorkerProfile.passportNumber`, `WorkerProfile.phone`
- `EmployerProfile.administratorId`, `EmployerProfile.phone`

A **legacy** column, `WorkerProfile.passportNumberEnc`, still exists in the live database in a different, incompatible ciphertext format (predates `lib/encrypt.ts`) and is **not declared in `schema.prisma` at all** — pure DB drift. Its data was migrated into the current `passportNumber` column by `scripts/reencrypt-passports.ts`. Verified zero references remain in `backend/src`; a standalone `scripts/retire-passportNumberEnc.sql` (manual, not a tracked migration) is staged but not run — see §10 for the one-row precondition blocking it.

Every decrypt call site follows the same **decrypt-guard pattern**: `try { decrypt(x) } catch { null }`, so one row with malformed/legacy ciphertext can never 500 an entire endpoint (this was the actual root cause of a previously-diagnosed production 500 on `EmployerProfile.administratorId`).

### Scheduled-job pattern

`JobRunLog` (`jobName`, `status: success|partial|failed`, `recordsProcessed`, `recordsFailed`, `startedAt`/`completedAt`/`durationMs`) is written by every cron-style job (`lock-daily-billing`, `lock-expiry-processor`, `match-score-recalc`) — both for observability and, in `match-score-recalc`'s case, as the actual mechanism for "since last run" incremental queries (no separate cursor table).

### Migration discipline

- **Additive-only**: every migration since `20260704120000_phase1_additive_reconcile` uses `ADD COLUMN IF NOT EXISTS` / `ADD CONSTRAINT ... NOT VALID` / `CREATE INDEX IF NOT EXISTS` — nothing drops or renames a live column without a separate, explicitly-reviewed step.
- **`NOT VALID` + deferred `VALIDATE CONSTRAINT`**: used for every FK backfilled onto a table that might already contain violating rows — lets the constraint deploy immediately (stopping new violations) without blocking on a cleanup script's timing.
- **`scripts/` data-migration convention**: raw `pg` client over `DIRECT_URL` (not Prisma — avoids client-generation timing issues), dry-run by default, explicit `--execute`/`--apply` flag required to write, verification query after writes, no PII logged. Used by `reencrypt-passports.ts`, `backfill-worker-phones.ts`, `flip-video-privacy.ts`, `sweep-orphaned-profiles.ts`.

---

## 7. Security Model

### Authentication

JWT via `jose` (`lib/auth.ts`): 15-minute access token (`JWT_ACCESS_EXPIRES_IN=15m`), 30-day refresh token (`JWT_REFRESH_EXPIRES_IN=30d`, stored in the `Session` table, rotated on use). **Only one cookie is ever set**: `dh_refresh` (httpOnly, scoped to `/api/auth/refresh`). The access token is returned in the JSON response body and kept client-side in `localStorage`, sent as an `Authorization: Bearer` header on every request — it is **not** a cookie.

This is a deliberate, documented design choice, not an oversight: the code comment in `lib/auth.ts:73-77` states verbatim that setting just one cookie "means each auth response carries exactly one Set-Cookie header, avoiding proxy layers (e.g. the Next.js rewrite bridging directhire.cc -> api.directhire.cc) that mishandle/coalesce multiple Set-Cookie headers on one response." This was diagnosed and fixed after a production bug where the refresh cookie never reached the browser — a prior two-cookie design (`dh_access` + `dh_refresh`) silently lost one `Set-Cookie` header somewhere in the rewrite path.

Note also: `frontend/src/middleware.ts` does **not** enforce auth — its own comment states "Auth is handled client-side via AuthContext + localStorage. Middleware only blocks static assets and passes everything else through." Route protection for the browsing experience happens in `(app)/layout.tsx` (checks for a token in `localStorage`, redirects if absent) — a client-side check, backstopped by the backend's own `requireAuth` on every API call. A user with JS disabled or a stale build could theoretically see a protected page's shell before data calls 401 and redirect; this is a real, if minor, defense-in-depth gap worth knowing about for due diligence.

### RBAC middleware chain (`middleware/auth.middleware.ts`)

```
requireAuth(allowedRoles?, { requireVerified? })
  │
  ├── requireWorker / requireEmployer / requireAdmin / requireAnyAuth   (role-only)
  └── requireVerifiedWorker / requireVerifiedEmployer                  (role + accountStatus === "VERIFIED")
```

Plus `requireSubscription` (`subscription.middleware.ts`) as a separate, composable middleware — applied selectively per employer route (creating/editing/submitting jobs, locking workers: gated; reading your own data, releasing a lock: not gated, so a lapsed employer never loses visibility into their own history).

### Storage security

Supabase Storage, single bucket. Every signed-URL call site (5 of them, across `uploads.controller.ts`, `admin-documents.controller.ts`, `admin.controller.ts`, `employer.controller.ts`) shares one constant, `SIGNED_URL_EXPIRY_SECONDS = 3600` (`services/storage/index.ts`), so expiry can't drift out of sync across endpoints. File-type sensitivity split:

- **Private** (signed URL required): `MEDICAL_CERTIFICATE`, `BUSINESS_DOCUMENT`, `WORK_VIDEO`, `INTRO_VIDEO`
- **Public** (raw URL): `PROFILE_PHOTO`, `COMPANY_LOGO` — deliberately, not an oversight: these render in bulk across browse grids (employer/worker search results, admin approval queues) where signing N thumbnails per page load would mean N round-trips.

The bucket ACL itself (public vs. private at the Supabase-dashboard level) is managed manually outside the codebase — the app-level `isPrivate` flag is cosmetic if the bucket itself is public, so this is a manual, one-time operational step, not something `git push` can drift.

### PII encryption & decrypt guards

Covered in §6. The pattern is consistent across every read site: never let a single malformed ciphertext take down an endpoint that serves many rows.

### GDPR posture

- **Consent capture**: explicit, unchecked-by-default checkbox at registration (both roles, same form), linked to Terms/Privacy, required to submit. Persisted as `User.consentAcceptedAt` + `consentPolicyVersion` (currently `"2025-01"`, matching the "Last updated" date on the actual `/terms`/`/privacy` pages — bump the constant in `auth.controller.ts` when those pages change materially).
- **Deletion pipeline** (`auth.controller.ts:deleteAccount`): writes an audit log entry *before* deleting (FK would block it after), anonymizes `AuditLog.actorId` to the literal string `"DELETED_USER"` (by design — `AuditLog` has no FK to `User` for exactly this reason, not an oversight), explicitly deletes `AdminAuditLog` rows referencing the user (no cascade — those FKs have no `onDelete` clause, `RESTRICT` by default), explicitly deletes `Application` rows where the user is the employer (no cascade on that relation either), invalidates sessions, then `prisma.user.delete()` — which, as of this cycle's FK reconciliation, now genuinely cascades through `WorkerProfile`/`EmployerProfile`/`Upload` and their children.
- **Email suppression**: covered in §5.

### Honest known gaps

- **OAuth consent re-prompt**: Google/LinkedIn OAuth signup (`oauth.handler.ts`) creates a `User` through a completely separate code path that never shows the consent checkbox — those accounts have `consentAcceptedAt: NULL` indefinitely. The standard remedy (re-prompt on next login for any account with null consent) is a known, explicitly deferred follow-up — not built.
- **8 FK-less tables pending a pass**: `EmailLog`, `EmailVerificationToken`, `Notification`, `OnboardingProgress`, `PasswordResetToken`, `Payment`, `Session`, `VerificationRecord` all have a `userId` column with no live FK constraint (same drift class as §6's fix, just not individually orphan-audited yet — deliberately not bundled into that migration to avoid guessing at data hygiene without checking each table first).

---

## 8. Infrastructure & Operations

### Deployment

- **Frontend**: Vercel, auto-deploys `main`. Build is `next build` — the project has specifically been bitten by Vercel's stricter build-time ESLint (`react/no-unescaped-entities` fails the build; `react-hooks/exhaustive-deps` is warning-only and does *not* fail it, which caused a real deploy failure to initially look unrelated to actual errors in a prior incident). Because of that, **local `npm run build` (not just `tsc --noEmit`) is now standard practice before every push** — `tsc` alone would have passed while Vercel's build failed.
- **Backend**: Railway, auto-deploys `main` from the `backend/` workspace. Single Express process (`backend/src/server.ts`), no separate worker dyno currently running (see the BullMQ note below).
- **Database**: Supabase-managed Postgres. Migrations applied via `prisma migrate deploy`, run manually/deliberately — not wired into the auto-deploy pipeline (every migration in this codebase's recent history has been explicitly reviewed before running, several as a direct human-issued `npx prisma migrate deploy`).

### Environment variables by service (names only — see `backend/.env.example` for full reference; no values reproduced here)

| Service | Variables |
|---|---|
| Server / CORS | `PORT`, `NODE_ENV`, `FRONTEND_URL`, `BACKEND_URL`, `ALLOWED_ORIGINS` |
| Database | `DATABASE_URL` (pooled), `DIRECT_URL` (direct, migrations) |
| JWT | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` |
| Encryption | `ENCRYPTION_KEY` |
| Cron | `CRON_SECRET` |
| Storage | `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Email | `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `RESEND_API_KEY`, (optional) `RESEND_AUDIENCE_ID`, (fallback) `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` |
| Queue | `JOBS_INLINE_MODE`, `REDIS_URL` |
| Admin seed | `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` |
| OAuth | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_EMPLOYER_PRICE_ID` |
| Frontend | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |

### Queue & scheduler jobs

| Job | Schedule | What it does |
|---|---|---|
| `lock-daily-billing` | 00:05 UTC daily | Expires locks with a stale unconfirmed payment (past grace period); sends 48h expiry warnings |
| `lock-expiry-processor` | Hourly, :15 | Expires locks past their natural expiry date |
| `match-score-recalc` | 02:15 UTC daily | Refreshes `Application.matchScore` for active-status applications whose job/worker profile changed since last run |
| `onboarding-reminders` | 09:00 UTC daily | Emails stale-onboarding nudges, 7-day cooldown via `EmailLog` |
| `verification-code-cleanup` | Every 6h (plain `setInterval` in `server.ts`, not the scheduler module) | Deletes expired/old OTP codes |

All five are also reachable manually via `GET /api/cron?job=<name>` behind an `X-Cron-Secret` header, for on-demand triggering independent of the schedule.

**Two distinct BullMQ queues exist, and only one is fully wired end-to-end**: `directhire-scheduled` (the five jobs above) has both a registration path (`registerBullMQJobs`) and a real consumer (`startBullMQWorker`, started from the same `startScheduler()` call at boot) — genuinely functional if `REDIS_URL` is set. The `directhire` queue (ad-hoc jobs: emails, `scoring.calculateMatchScores`) is pushed to via `enqueue()` in production BullMQ mode, but **no worker process consumes it** — `scripts/jobs-worker.ts` is referenced in a code comment as "a separate worker process" but does not exist in the repo. In practice this queue only does real work when `JOBS_INLINE_MODE=true` (the documented default), which runs every enqueued job synchronously in the request process instead of via Redis at all.

### Build discipline

Standard pre-push checklist across this codebase's recent history: `tsc --noEmit` on both `backend/` and `frontend/`, then `npm run build` on the frontend specifically (the Vercel-equivalent stricter check — see above). Additive-only migrations are shown for review before any `prisma migrate deploy` is run.

---

## 9. Admin Controls

### Modules (all under `/admin/*`, `requireAdmin`)

| Module | Controller | Capabilities |
|---|---|---|
| Onboarding review | `admin.controller.ts` | Approve/reject/needs-changes on submitted accounts; suspend/reinstate; user search/list |
| Document review | `admin-documents.controller.ts` | Batch photo/video/passport approve/reject per worker, with notes |
| Job moderation | `admin-jobs.controller.ts` | Approve/reject/request-changes/archive job posts; revoke/restore an employer's posting rights |
| Lock monitor | `admin-locks.controller.ts` + `/admin/locks` (built this cycle) | List/filter all reservations by status; force-release with a required internal reason |
| Platform config | `admin-config.controller.ts`, `admin-pricing.controller.ts` | Lock daily rate / max concurrent / max duration; application fee base + enable toggle |
| Revenue | `admin-revenue.controller.ts` | Summary, chart, payment log |
| Audit log | `admin.controller.ts:getAuditLog` | Full `AdminAuditLog` timeline, filterable by admin/target/action/date |
| Email logs | `admin.controller.ts:getEmailLogs/getEmailStats` | Delivery status, per-type counts |

### Audit coverage

Two parallel audit mechanisms: `insertAuditLog` (general-purpose, `AuditLog` table, **12 call sites**) and `insertAdminAuditLog` (admin-specific actions with a typed `AuditAction` enum, `AdminAuditLog` table, **21 call sites**) — together spanning every state-changing admin action (approve/reject/suspend/reinstate, job moderation, lock override, document batch review) plus a handful of user-self-service actions (file upload, application submission) that are audit-relevant but not admin-initiated. Every lock force-release specifically writes both an `AdminAuditLog` entry (with `lock_id`, `employer_id`, `total_billed` in `metadata`) and triggers the neutral-notification pattern (§5) — verified as part of building the lock monitor UI this cycle, not a new addition.

### Override capabilities

- **Lock force-release**: `POST /admin/locks/:lockId/override`, requires a non-empty internal note, sets `lockStatus: OVERRIDDEN`, clears the worker's lock flags, notifies both parties with a status-neutral message (the internal note is never shown to either party).
- **User suspend/reinstate**: invalidates all sessions on suspend (`Session.deleteMany`); reinstate clears `suspendedAt` and restores `VERIFIED`.
- **Job moderation**: approve/reject/request-changes, each appending a structured entry to `JobPost.moderationHistory` (JSON array) rather than just flipping `status` — preserves a full decision trail per job, not just the current state.

---

## 10. Roadmap (Honest)

Items below are either schema-scaffolded-but-not-implemented, explicitly deferred during recent work, or flagged findings from this cycle's audits. None are silently omitted from this document.

1. **Fraud/risk scoring** — `WorkerProfile.riskScore`, `AiDecisionLog` table, and the `fraud.analyzeUser` job type all exist; no scoring logic has been written. Building this is a scoped, standalone project (needs a signal source — document mismatch detection, velocity checks, etc. — none currently exist).
2. **Match-score feedback loop** — no mechanism validates predicted match quality against actual hire outcomes. `AiDecisionLog` is shaped for this but unused.
3. **Supabase Realtime upgrade** — the entire notification/list-refresh system is poll-based (§5). A Realtime or websocket layer would cut latency and request volume, but is a genuine infra addition, not a small change.
4. **Public job SEO pages** — neither the authenticated worker feed nor the public `(public)/jobs` listing has per-job detail routes; both are list+modal. If public discoverability/SEO is a priority, the higher-value build is a `(public)/jobs/[id]` page (already has `publicJobsApi` to back it), not an authenticated `/worker/jobs/[id]` route.
5. **OAuth consent re-prompt** — see §7. OAuth signups have no recorded consent; needs a login-time re-prompt for any account with `consentAcceptedAt: NULL`.
6. **8 FK-less tables pending a pass** — see §6/§7. `EmailLog`, `EmailVerificationToken`, `Notification`, `OnboardingProgress`, `PasswordResetToken`, `Payment`, `Session`, `VerificationRecord`. Each needs its own orphan audit before a blanket FK-add migration (the same live-DB-drift class already found and partially fixed this cycle).
7. **Dead `Sidebar` poller decision** — `(app)/layout.tsx`'s `Sidebar` component only ever mounts for `role === 'worker'` (employer/admin use `DashboardHeader`'s nav instead), so its admin-stats and employer-lock-count pollers are unreachable code, not actually broken functionality. Needs a decision: delete the dead branches, or wire `Sidebar` for those roles and delete the equivalent logic from `DashboardHeader`.
8. **`Payment` field-naming cleanup** — `Payment.status` and `Payment.type` are plain `String` columns with comment-documented allowed values (`PENDING|SUCCEEDED|FAILED|REFUNDED`, `SUBSCRIPTION|WORKER_LOCK|APPLICATION_FEE`) rather than real Postgres enums — a Phase 1 migration explicitly deferred converting them because production already had data in a different shape at the time. Worth revisiting now that the FK/drift picture is clearer.
9. **`passportNumberEnc` retirement** — verified zero code references; drop script staged at `backend/scripts/retire-passportNumberEnc.sql` (manual, not a tracked migration). **Precondition**: a live-DB check found exactly 1 row still holding a non-NULL legacy value — confirm that row's current `passportNumber` is correctly populated (re-run `reencrypt-passports.ts --inspect` or query directly) before running the drop.
