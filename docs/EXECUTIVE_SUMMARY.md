# DirectHire — Executive Summary

**Prepared for:** prospective buyers and their due-diligence advisors
**Companion document:** `docs/ARCHITECTURE.md` (full technical architecture, verified against source) and `docs/DEPLOYMENT_OPERATIONS.md` (deployment and operations reference for the buyer's engineering team)

---

## What DirectHire is

DirectHire is a live, three-role job marketplace connecting verified workers with employers across international borders, with every account, document, and job post gated by human admin review before it becomes visible to the other side. The platform is in production at **directhire.cc**.

The three roles:

- **Workers** — job seekers, primarily blue-collar and service roles, seeking employment abroad.
- **Employers** — companies hiring internationally, who browse and reserve candidates, post jobs, and manage applications.
- **Admins** — platform operators who approve or reject every worker account, every document, and every job post before either side can see it. Nothing goes live without a human decision.

The platform's distinguishing mechanics, as actually built and running:

- A transparent, rule-based matching score (not a black-box AI model) that ranks job/worker fit using skills, experience, salary expectations, location preference, and a trust score — explained further below.
- **Worker Lock**, a paid reservation system letting an employer exclusively hold a candidate for a period so no other employer can hire them away mid-process.
- An admin-mediated trust layer: every worker account, every uploaded document, and every job posting is reviewed by a human before either side can see it.

---

## Business model as built

Three revenue mechanisms are implemented and in production:

1. **Employer subscriptions.** Employers pay a recurring subscription (via Stripe) to access the platform's core hiring features — browsing candidates, posting jobs, reserving workers. New employers get a **14-day free trial** with full feature access before payment is required.
2. **Worker Lock reservations.** An employer can pay to exclusively reserve a candidate, currently priced at **$2.00 per day**, charged upfront for the full reservation period (e.g., a 5-day reservation charges $10.00 at the moment of reservation). If the employer releases the worker early, the unused days are **refunded automatically** via Stripe — no manual intervention. Both the daily rate and the maximum reservation length are configurable by an admin without a code change.
3. **Application fees.** Workers pay a small, dynamically-priced fee to apply to a job, ranging from **$1.00 to $25.00** depending on the job's salary tier, how competitive that market currently is (more employers hiring than workers targeting a country raises the fee; the reverse lowers it), and the applicant's own match quality and trust score (a strong-fit, trusted applicant gets a discount; a poor-fit or low-trust applicant pays a surcharge). This entire pricing formula is admin-configurable and can be disabled platform-wide with a single setting if fees are ever waived.

DirectHire does not hold funds in escrow at any point — it charges platform fees directly via Stripe and never sits between the employer and worker as a financial intermediary for wages.

---

## What the platform actually does, feature by feature

- **Verified onboarding.** Every worker and employer completes a multi-step, auto-saved onboarding flow collecting identity, professional, and (for employers) company details, plus required document uploads. Nothing is visible to the other side, and no job application or worker reservation can happen, until an admin has approved both the account and its documents.
- **AI-assisted matching.** Every job listing shows each worker a live-computed match percentage based on a documented, auditable weighted formula — skills overlap, experience fit, salary alignment, location preference, and trust score. This is a transparent scoring rule the platform operator can explain to any worker or employer who asks, not an opaque model.
- **Full application lifecycle.** A worker applies, the employer reviews (viewed → shortlisted → interviewed), and once an interview stage is reached the worker can see the employer's contact details. The worker can independently accept or decline the interview invitation. The employer makes the final accept/reject decision. Every transition is enforced by the backend, not just hidden in the interface — an illegal status change (e.g., skipping straight from "applied" to "hired") is rejected outright.
- **Two-way messaging** between employers and the specific workers they're engaging with.
- **Dual-channel notifications.** Every significant event (a new message, a job match, an application update, a reservation status change, an account decision) generates both an in-app notification and — for the events that warrant it — an email, so neither side has to be actively watching the platform to know something happened.
- **Admin moderation and a full audit trail.** Every admin decision — account approval, document review, job approval, reservation force-release, user suspension — is logged with who did it, when, and why, in a searchable audit log. This is a real operational record, not a marketing claim: every state-changing admin action in the codebase writes to it.
- **Public, search-engine-visible job pages.** Job listings are also published on public pages with structured data recognized by Google for Jobs (Google's job-search rich results), plus a sitemap and robots configuration — so job posts are discoverable outside the platform itself, not only to logged-in workers.
- **External jobs curation.** Admins can manually add links to job postings from other sites (e.g., major job boards) that appear alongside DirectHire's own listings in the worker feed and public pages, giving workers a single place to look even for opportunities DirectHire didn't originate.
- **A working demo environment.** A seed script can populate a full demo dataset — sample workers, employers, and a complete application lifecycle end to end — behind a dedicated password, entirely reversible, useful for live product demonstrations without touching real user data.

---

## Technology

The frontend is built in **Next.js**, deployed on **Vercel** with automatic deployment from the main branch. The backend is a single **Express/TypeScript** service deployed on **Railway**, also auto-deployed from main. Data lives in **Supabase-managed Postgres**, with file uploads (documents, photos, videos) in **Supabase Storage**. Payments run through **Stripe** (subscriptions and one-off charges). Transactional and reminder email is sent via **Resend**. Every one of these is a well-documented, widely-used commercial service with straightforward account portability — nothing here is a bespoke or unmaintained piece of infrastructure a new owner would need specialized knowledge to operate.

---

## Verification statement

The core user-facing flows — registration, multi-step onboarding, admin verification, job matching, job application through to interview response, and Worker Lock reservation payment with automatic prorated refund on early release — have been verified end to end, including live tests against Stripe's test environment confirming a reservation charge, a partial refund, and a declined-card scenario all behave correctly. This is beyond static code review: real API calls were made, real (test-mode) payments were charged and refunded, and the resulting database records were checked directly.

Security posture, as built and verified:

- Sensitive personal fields (passport numbers, phone numbers, employer administrator IDs) are encrypted at rest, not stored in plain text.
- Uploaded documents that are sensitive by nature (medical certificates, business registration documents, verification videos) are stored in private cloud storage and served only via time-limited signed links — never a permanently public URL. Profile photos and company logos, which appear in bulk across browse pages, are the deliberate exception and are served as plain public images.
- GDPR-relevant mechanics are implemented: explicit consent capture at registration, an account deletion pipeline that removes personal data while preserving a legally-defensible audit trail, and a working email-unsubscribe mechanism for the one email type users can opt out of.

A small number of known, honestly-disclosed gaps remain (documented in full in `docs/DEPLOYMENT_OPERATIONS.md`) — none of them block the platform's current operation, and all were found through the same rigorous, code-level review that produced the verification above rather than left undiscovered.
