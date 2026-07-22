# DirectHire — Deployment & Operations Reference

**Audience:** the buyer's engineering team, for taking over deployment, external-service ownership, and day-to-day operations.
**Companion document:** `docs/ARCHITECTURE.md` (full technical architecture — read that first for how the system is built; this document covers how to run it).

Every environment variable name, webhook event, and file/line reference below was verified directly against the current source tree, not carried over from memory or prior documentation. Values are never reproduced — only variable names and their purpose.

---

## 1. Deployment topology

```
Browser
  │
  ▼
www.directhire.cc   (Vercel — Next.js, auto-deploys from `main`)
  │
  │  every /api/* request is rewritten (frontend/next.config.js), not redirected —
  │  the browser always talks to www.directhire.cc, so auth cookies never cross
  │  an origin boundary
  ▼
api.directhire.cc   (Railway — Express/Node, single process, auto-deploys from `main`)
  │
  ├── Supabase Postgres   (DATABASE_URL pooled via pgbouncer / DIRECT_URL direct, for migrations)
  ├── Supabase Storage    (private bucket "directhire-uploads", signed URLs)
  ├── Stripe              (subscriptions, Worker Lock charges, application fees)
  ├── Resend              (transactional + reminder email)
  └── Redis (optional)    (BullMQ — only one of two queues has a live consumer; see §4)
```

- **Frontend deploy**: Vercel, `main` branch, standard `next build`. Vercel's build-time linting is stricter than a local `tsc` check (see §4, Build discipline) — a `tsc`-clean commit can still fail on Vercel.
- **Backend deploy**: Railway, `main` branch, `backend/` as the deploy root. One Express process; no separate worker dyno is currently provisioned (relevant to the BullMQ note in §4).
- **Database**: Supabase-managed Postgres. Migrations are **not** part of the auto-deploy pipeline — every migration in this project's history has been run manually and deliberately via `prisma migrate deploy` (see §4).
- **Domain/proxy design**: the frontend's `next.config.js` proxies `/api/:path*` to `NEXT_PUBLIC_API_URL` unconditionally. This single rewrite is why the platform's one-cookie auth design works at all in production — see `docs/ARCHITECTURE.md` §7 for why only one `Set-Cookie` header is ever sent.

---

## 2. Environment variable inventory

Verified by grepping every `process.env.*` reference in `backend/src`, `backend/scripts`, and `frontend/src` directly — this list reflects what the code actually reads today, not what any `.env.example` file claims.

### Backend

| Variable | Purpose |
|---|---|
| `PORT` | Express listen port |
| `NODE_ENV` | `development` / `production` — affects CORS strictness, logging format, static `/uploads` mount |
| `FRONTEND_URL` | Used for CORS, Stripe Checkout success/cancel URLs, and every backend-generated link that points back at the app |
| `BACKEND_URL` | Used to construct the OAuth `redirect_uri` sent to Google/LinkedIn (see §3) — must exactly match what's registered with each provider |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list |
| `DATABASE_URL` | Pooled Postgres connection (pgbouncer, port **6543**) — used by Prisma at runtime |
| `DIRECT_URL` | Direct Postgres connection (port **5432**) — used only for `prisma migrate deploy` and the raw-`pg` scripts in `scripts/` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets for the two token types |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (currently 15m / 30d) |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | *(optional, code-defaulted — not in `.env.example`)* Override the refresh-cookie's `SameSite`/`Secure` attributes in `lib/auth.ts`; only needed if the default production-safe values need adjusting for a non-standard deploy topology |
| `ENCRYPTION_KEY` | 32-byte (64 hex char) AES-256-GCM key for encrypting passport numbers, phone numbers, and employer administrator IDs at rest |
| `CRON_SECRET` | Required `X-Cron-Secret` header value for the manual `GET /api/cron?job=<name>` trigger endpoint |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | *(optional, code-defaulted to 60000 / 200 — not in `.env.example`)* Global rate limiter tuning |
| `STORAGE_PROVIDER` | `supabase` (production) or `local` (dev fallback, writes to `.uploads/` on disk) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | **Must be the service_role key, not the anon key** — see the verification method in §3 |
| `SUPABASE_STORAGE_BUCKET` | Bucket name (`directhire-uploads` in production) |
| `EMAIL_PROVIDER` | `resend` (production), `smtp` (fallback), or `console` (dev, no real sends) |
| `RESEND_API_KEY` | Resend API key — app **fails to start** without this if `EMAIL_PROVIDER=resend` |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for `/api/webhooks/resend` (see §3) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Only read when `EMAIL_PROVIDER=smtp` |
| `OWNER_EMAIL` | Destination for new-registration/new-submission/contact-form owner notifications; falls back to a hardcoded address if unset — **set this explicitly in production** |
| `APP_NAME` | *(optional, defaults to `"Direct Hire"` — not in `.env.example`)* Product name interpolated into every email template's subject/body/footer |
| `JOBS_INLINE_MODE` | `true` (documented default) runs every enqueued job synchronously in the request process; `false` requires a live BullMQ consumer (see §4 — currently only one of two queues has one) |
| `REDIS_URL` | Only relevant if `JOBS_INLINE_MODE=false` |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Credentials for the one seeded admin account (`scripts/seed.ts`) |
| `DEMO_SEED_PASSWORD` | Shared password for every demo account created by `scripts/seed-demo.ts` — required for `--execute`, never used outside that script (see §4) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth credentials |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook` |
| `STRIPE_EMPLOYER_PRICE_ID` | The recurring Price object ID for the employer subscription |
| `DISABLE_APPLICATION_FEES` | *(optional)* Set `true` to waive worker application fees platform-wide (returns $0.00) without touching `PlatformConfig` |

**Known-dead backend variables (present in `.env.example`, read by nothing in current source — flag for cleanup, don't carry forward):**

- **`STRIPE_PUBLISHABLE_KEY`** — zero references anywhere in `backend/src`. The publishable key the app actually uses is the frontend's own `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (below). This backend entry can be removed from `.env.example`/Railway config.
- **`GOOGLE_CALLBACK_URL`** — already flagged dead in `.env.example`'s own comment (a typo predating the current hardcoded `redirect_uri` construction in `oauth.handler.ts`); never read.
- **`RESEND_AUDIENCE_ID`** — zero references in `backend/src`. `.env.example` documents it as "required only if using Resend audience/contact list sync," but no such sync feature exists in the codebase — this was either planned and never built, or removed. Safe to leave unset.
- **`EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME`** — already removed from `.env.example` (its own comment explains why: every FROM address is hardcoded in `services/email/index.ts`). Noted here only so a new operator knows changing sender addresses requires a source-code edit, not an env var.

### Frontend

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend origin the Next.js rewrite proxies `/api/*` to (see §1) |
| `NEXT_PUBLIC_APP_URL` | The app's own public origin, used where an absolute frontend URL is needed |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js publishable key — used to initialize Stripe Elements on every payment-collecting page (reservation, extension, application fee) |

No other frontend environment variables are read anywhere in `frontend/src`.

---

## 3. External services setup checklist

The buyer will need to create fresh accounts for every service below and re-point the environment variables at them — none of the credentials in the current deployment transfer to a new legal owner.

### 1. Stripe

- **Account activation requires a registered business entity in a Stripe-supported country.** Albania is **not** on Stripe's supported-country list. Operators based there commonly resolve this via an EU entity — Estonia's e-Residency program (an Estonian OÜ) is a well-established route others in a similar position have used, since Estonia is Stripe-supported and e-Residency doesn't require physical residence there. This is a business/legal decision, not a code change.
- **Live keys**: generate live-mode `STRIPE_SECRET_KEY` and a live-mode publishable key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) from the Stripe Dashboard. Test-mode and live-mode keys are entirely separate credential pairs.
- **Live webhook endpoint** — Stripe webhooks are configured **per mode**; a webhook registered in test mode does not carry over to live mode. Create a live-mode endpoint pointed at `https://api.<domain>/api/stripe/webhook` and subscribe it to exactly the events the handler processes (verified from `backend/src/controllers/webhook.controller.ts`):
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

  Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
- **Live products/prices**: a test-mode Price ID does not exist in live mode. Recreate the employer subscription's recurring Price in the live Stripe Dashboard and set `STRIPE_EMPLOYER_PRICE_ID` to the new live Price ID.
- **Variables to set**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_EMPLOYER_PRICE_ID` (backend); `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (frontend).

### 2. Supabase

- Create a new Supabase project.
- Set `DATABASE_URL` to the **pooled** connection string (port **6543**, `pgbouncer=true`) — this is what the running app uses.
- Set `DIRECT_URL` to the **direct** connection string (port **5432**) — this is what `prisma migrate deploy` and every script in `scripts/` uses; migrations run against pgbouncer's pooled port can fail or behave unpredictably.
- Set `SUPABASE_SERVICE_KEY` to the project's **service_role** key — **not** the anon/public key. This distinction matters: a service_role key bypasses Supabase's row-level-security policies by design, which every private-file upload/signing code path in this app depends on; an anon key does not, and file uploads will fail with a row-level-security error if the wrong key is used. **Verification method** (this exact check surfaced a real misconfiguration during this project's own development — worth running, not skipping): a Supabase key is a JWT. Split it on `.`, base64url-decode the middle segment, and confirm the decoded JSON's `role` field reads `"service_role"`, not `"anon"`. Do this before relying on the key in any environment.
- Create the storage bucket named `directhire-uploads` (or update `SUPABASE_STORAGE_BUCKET` to match a different name) and **set it to Private** at the Supabase dashboard level. This is a manual, one-time dashboard step, not something the codebase can enforce — the application's own per-file `isPrivate` flag is cosmetic if the bucket itself is public.

### 3. Google OAuth

- Create a Google Cloud project (or reuse one dedicated to this app).
- Configure the OAuth consent screen and **publish it for production** — while a consent screen sits in "Testing" status, Google restricts sign-in to a short explicit list of test users, which will not work for real customers.
- Create an OAuth 2.0 **Web application** client with:
  - Authorized JavaScript origin: `https://www.<domain>`
  - Authorized redirect URI: `https://api.<domain>/api/auth/google/callback`

  This redirect URI must match **exactly** what the backend constructs — verified directly from `backend/src/routes/oauth.handler.ts`, the backend builds it as `${BACKEND_URL}/api/auth/google/callback`. Whatever `BACKEND_URL` is set to in production is what must be registered here, character for character (scheme, host, path, no trailing slash).
- Put the resulting credentials into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 4. LinkedIn OAuth

- Create a LinkedIn app in the LinkedIn Developer portal.
- Add redirect URL: `https://api.<domain>/api/auth/linkedin/callback` — same construction pattern as Google (`${BACKEND_URL}/api/auth/linkedin/callback`, verified from the same `oauth.handler.ts`).
- Put the resulting credentials into `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`.

### 5. Resend

- Verify the sending domain in Resend's dashboard (SPF/DKIM records on the buyer's own domain).
- Note: every FROM address is **hardcoded in `backend/src/services/email/index.ts`** (currently `@directhire.cc` addresses), not environment-configurable — if the domain changes, that source file needs a direct edit, not just a Resend domain re-verification.
- Generate an API key → `RESEND_API_KEY`. The app **will not start** with `EMAIL_PROVIDER=resend` and no key set.
- Create a webhook endpoint at `https://api.<domain>/api/webhooks/resend`, subscribed to exactly the events the handler processes (verified from `backend/src/controllers/resend-webhook.controller.ts`):
  - `email.bounced`
  - `email.complained`

  Resend delivers webhooks via Svix; copy the endpoint's Svix signing secret into `RESEND_WEBHOOK_SECRET`. The app rejects webhook requests outright (500) if this isn't set.

---

## 4. Operations

### Migration procedure

Migrations are **additive-only** by convention since `20260704120000_phase1_additive_reconcile` — every migration uses `ADD COLUMN IF NOT EXISTS` / `ADD CONSTRAINT ... NOT VALID` / `CREATE INDEX IF NOT EXISTS`, never a bare drop or rename of a live column without a separate, explicitly-reviewed step. Foreign keys added onto tables that might already contain violating rows use `NOT VALID` (enforces immediately for new writes) followed by a deferred `VALIDATE CONSTRAINT` once any existing violations are cleaned up — this lets a constraint deploy without blocking on a cleanup script's timing.

Deploying a migration is a manual, deliberate step — it is **not** wired into the Railway auto-deploy pipeline:

```
cd backend
npx prisma migrate deploy   # runs against DIRECT_URL, never the pooled DATABASE_URL
```

Every migration in this project's history has been reviewed before that command was run.

### Data-migration script pattern (`backend/scripts/`)

One-off data migrations (as opposed to schema migrations) follow a consistent, deliberately conservative pattern: raw `pg` client connected via `DIRECT_URL` (not the Prisma client — avoids client-generation timing issues and, for the backup script specifically, lets it see tables/columns Prisma's schema no longer declares), **dry-run by default**, requiring an explicit `--execute` (or equivalent) flag to write anything, with a verification query printed after any write and no PII ever logged to the console. Current scripts following this pattern: `reencrypt-passports.ts`, `backfill-worker-phones.ts`, `flip-video-privacy.ts`, `sweep-orphaned-profiles.ts`.

### Scheduled jobs

| Job | Schedule | What it does |
|---|---|---|
| `lock-daily-billing` | 00:05 UTC daily | Expires any reservation whose initial payment never confirmed within the grace period; sends 48-hour expiry warnings |
| `lock-expiry-processor` | Hourly, :15 | Expires reservations past their natural end date |
| `match-score-recalc` | 02:15 UTC daily | Refreshes stored match scores for still-active applications whose job or worker profile changed since the last run |
| `onboarding-reminders` | 09:00 UTC daily | Emails stale-onboarding nudges, with a 7-day cooldown per recipient |
| `verification-code-cleanup` | Every 6 hours | Deletes expired one-time verification codes |

**Inline-scheduler characteristics**: with `JOBS_INLINE_MODE=true` (the documented default) and no `REDIS_URL`, all five jobs run via in-process `setTimeout` chains — no Redis dependency at all. Each job computes the delay until its next scheduled fire time and reschedules itself after running, so a process restart does **not** desynchronize the schedule going forward. What it does **not** have is persistence or catch-up: if the Railway process happens to be down at the exact moment a job would have fired, that run is simply skipped — there is no backfill mechanism. Every job is also reachable on demand via `GET /api/cron?job=<name>` behind an `X-Cron-Secret` header, which is the way to manually catch up a missed run. Every run — scheduled or manual — writes a row to `JobRunLog` (`jobName`, `status`, `recordsProcessed`/`recordsFailed`, timing), giving a queryable history independent of Railway's own logs.

### Backup procedure

```
cd backend
npm run backup:db
```

Runs `scripts/export-db-backup.ts` — a read-only JSON export of every table in the public schema, over a raw `pg` connection specifically so it also captures legacy tables/columns that `schema.prisma` no longer declares (Prisma's client can only see what's in the current schema; this backup exists precisely to not silently skip data outside it). Intended as a pre-migration safety net, not a substitute for Supabase's own managed backup/point-in-time-recovery offering.

### Demo seed usage

```
cd backend
npm run seed:demo -- --execute    # writes a full demo dataset (18 workers, 4 employers,
                                   # complete application lifecycle) under @demo.directhire.cc
npm run seed:demo -- --clean      # deletes every row reachable from a @demo.directhire.cc
                                   # User row — nothing else
```

Dry-run with no flag (prints what it would do, writes nothing). Requires `DEMO_SEED_PASSWORD` set in the environment — refuses to run `--execute` without it, and the password is never hardcoded anywhere. `--execute` also refuses to run if `@demo.directhire.cc` rows already exist (prints the count, tells you to run `--clean` first) — it will not silently double-seed.

### Build discipline

Standard pre-push checklist, verified across this project's own commit history: `tsc --noEmit` on both `backend/` and `frontend/`, then `npm run build` on the frontend specifically. The frontend's build check matters beyond `tsc`: Vercel's build-time ESLint is stricter than local type-checking alone (e.g., `react/no-unescaped-entities` fails the Vercel build; `tsc --noEmit` will not catch it) — this project has a documented prior incident where a `tsc`-clean commit still failed on Vercel for exactly this reason, which is why `npm run build` (not just `tsc`) is treated as the real pre-push gate.

---

## 5. Known items (honest disclosure)

### By design, not oversights

- **Worker Lock billing is prepay-upfront with automatic prorated refund on early release — not a recurring daily charge.** An employer is charged the full reservation amount at the moment of reservation; releasing early refunds the unused days automatically. This was deliberately evaluated and kept as-is rather than rebuilt as a day-by-day debit model.
- **Realtime updates are polling-based** (30-second to 5-minute intervals depending on the surface, visibility-aware — polling pauses when a browser tab is hidden), not websockets/Supabase Realtime. A push-based upgrade is a genuine infrastructure addition, not a small change.
- **Fraud/risk scoring is scaffolded, not implemented.** The schema field (`WorkerProfile.riskScore`), an admin-list column displaying it, and a queued job type all exist; no scoring logic has ever been written to populate it. Building this is a standalone project requiring a real signal source (document-mismatch detection, velocity checks, etc.) that doesn't currently exist.
- **OAuth signups do not capture consent.** Google/LinkedIn sign-in creates a user account through a code path that never shows the terms/privacy consent checkbox the standard registration form requires — those accounts have a permanently null consent timestamp. The planned remedy is a consent re-prompt on next login for any account missing it; not built.

### Roadmap items (from `docs/ARCHITECTURE.md` §10, status updated where changed since that document was written)

1. **Fraud/risk scoring** — still open (see above).
2. **Match-score feedback loop** — still open. `AiDecisionLog` is schema-shaped for validating predicted match quality against actual hire outcomes but is never written to anywhere in the codebase.
3. **Supabase Realtime upgrade** — still open (see above).
4. **Public job SEO pages** — **resolved since `ARCHITECTURE.md` was written.** That document's roadmap described neither the public nor the authenticated job feed as having per-job detail routes; a public `(public)/jobs/[id]` page with structured data now exists and is live (see the Executive Summary). The authenticated worker-side feed (`/worker/jobs`) remains list+modal by deliberate design, not oversight.
5. **OAuth consent re-prompt** — still open (see above).
6. **8 FK-less tables pending an orphan audit** — still open: `EmailLog`, `EmailVerificationToken`, `Notification`, `OnboardingProgress`, `PasswordResetToken`, `Payment`, `Session`, `VerificationRecord` each have a `userId` column with no live foreign-key constraint. Each needs its own orphan-row audit before a blanket FK-add migration, the same class of live-database drift already found and partially fixed for `WorkerProfile`/`EmployerProfile`/`Upload` (see `ARCHITECTURE.md` §6).
7. **Dead `Sidebar` poller code path** — still open: a sidebar component's admin/employer polling logic only ever mounts for the worker role in the current layout, making it unreachable rather than broken. Needs a decision (delete the dead branches, or wire the component for those roles).
8. **`Payment` field-naming cleanup** — **resolved.** `ARCHITECTURE.md` flagged `Payment.status`/`Payment.type` as needing to genuinely be plain-string columns rather than a real Postgres enum out of sync with `schema.prisma`. That drift (the live column actually was a mismatched enum type) was found and fixed via a dedicated migration converting it to `TEXT`, matching what `schema.prisma` had always declared.
9. **`passportNumberEnc` retirement** — still open. A legacy, incompatible-ciphertext-format column not declared in `schema.prisma` at all; a drop script is staged (`backend/scripts/retire-passportNumberEnc.sql`, manual, not a tracked migration) but blocked on one precondition — a single remaining row needs its current `passportNumber` value confirmed correct before the drop runs.

### Additional items found and fixed during this engagement

Disclosed for transparency, not because they're still open — these were real, previously-undetected defects found through direct end-to-end testing (including live Stripe test-mode charges and refunds) rather than static code review alone, and all were corrected:

- A request-body key-casing mismatch (`payment_intent_id` vs. `paymentIntentId`) meant every real worker-reservation confirmation silently failed — fixed.
- The reservation and reservation-extension "initiate payment" endpoints returned an unwrapped response shape the frontend's success check couldn't recognize as successful — meaning neither feature ever advanced past the first step in a real browser, since the first deploy, regardless of subscription status or payment method. Fixed; verified live end-to-end afterward (a real Stripe test-mode charge, confirmed, with the resulting reservation record checked directly in the database).
- The subscription-access gate checked only for `"ACTIVE"` status, meaning every employer still within their 14-day free trial was blocked from browsing candidates, reserving workers, and posting jobs — and workers were correspondingly blocked from applying to a trialing employer's job posts. Fixed to recognize an unexpired trial as valid access, matching the trial's own advertised terms.
- The business-document upload's file-type check rejected PDF (and, separately, SVG company logos) outright before ever consulting the correct per-document-type allow-list that already permitted them — meaning the single most likely real-world file format for a business registration document always failed to upload. Fixed.
- Two dashboard "recent job" cards linked to a per-job URL path that has never existed as a route, 404ing on every click. Fixed to point at the corresponding list page instead.
- `SUPABASE_SERVICE_KEY` in production held an **anon**-role JWT, not the service_role key — confirmed by decoding the token's `role` claim (the same JWT-decode check documented in §3). This is exactly the failure mode that check exists to catch, and it was live, not just a local-dev misconfiguration. Corrected to a verified service_role key in production; verified end-to-end afterward with a successful business-document PDF upload completing the full path (upload → private-bucket write → signed-URL retrieval) that a mismatched key would have blocked with a row-level-security error.

### Requires buyer verification during re-setup

- A Stripe.js console message (`Failed to execute 'postMessage' on 'DOMWindow'... target origin`) may appear during checkout — this is Stripe's own well-documented iframe-communication artifact (confirmed against Stripe's public issue trackers and reproduced across unrelated integrations), not a symptom of anything in this codebase. Payment flows complete successfully despite it; no action needed.
