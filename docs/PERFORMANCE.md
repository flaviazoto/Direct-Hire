# Performance

## How to measure

Run the same script, from the same machine, before and after a change:

```bash
node scripts/perf-baseline.js 20     # 20 sequential samples per public endpoint
```

The script is read-only: it makes unauthenticated GET requests with a pause
between them, well under the rate limits. Since the Vercel bot protection
change in late October 2026, `www.directhire.cc` answers scripted requests with
a 403 challenge page, so frontend timings come from a real browser instead
(Chrome DevTools, or the Performance API as described below).

## Baseline — production, 2026-10-28 (before the `perf/latency` changes)

API, measured from a European client (milliseconds):

| Endpoint | TTFB p50 | TTFB p95 | Payload | Notes |
|---|---|---|---|---|
| `GET /health` (no database) | 114 | 175 | 0.1 kB | network and app floor |
| `GET /api/public/config/pricing` | 112 | 699 | 0.3 kB | 60 s cache; p95 is a cache miss |
| `GET /api/public/jobs?limit=20` | 109 | 1118 | 2.8 kB | 60 s cache; p95 is a cache miss |
| `GET /api/public/jobs/:id` | **1025** | **1569** | 0.8 kB | no cache, 2 queries per view |
| `GET /api/public/jobs/categories` | 109 | 568 | 0.1 kB | 60 s cache |
| `GET /api/public/blog?limit=20` | **1019** | **1453** | 0.1 kB | no cache, 2 queries |

Frontend, real Chrome, production (old Next 14 build still served):

| Page | TTFB | DOMContentLoaded | Load | JS transferred |
|---|---|---|---|---|
| `/` (cold) | 81 ms | 2.4 s | 3.3 s | 316 kB / 18 files |
| `/jobs` (warm cache) | 88 ms | 3.9 s | 5.2 s | 328 kB, includes Stripe.js |
| `/pricing`, `/about`, `/login`, `/register` (warm) | 68–98 ms | 0.1–0.35 s | 0.15–0.42 s | cached |

## What the measurements showed

1. **Each database round trip from the API costs about 0.4–0.5 s.** Requests
   that touch no database (`/health`) or are served from the in-memory cache
   answer in about 110 ms; every uncached query adds about 450 ms. Two
   causes, both settings rather than code:
   - **`connection_limit=1`** in `DATABASE_URL` (as last seen in the local
     copy of the production settings). Each API instance holds a single
     database connection, so every query from every user waits in one queue.
     Supabase's pooler (port 6543, `pgbouncer=true`) handles more; for a
     long-running server use `connection_limit=10&pool_timeout=20`.
   - **Region distance (likely).** Supabase is in `eu-west-1` (Ireland). The
     Railway edge was `ams1`, but about 110 ms passes between the edge and the
     app even for `/health`, which suggests the service runs far from Europe.
     Check the region in Railway (service → Settings → Region) and move it
     to an EU-West region if it isn't one.
2. **The job-detail and blog endpoints had no cache**, and the job detail made
   two queries per view (an existence check plus the view-count update).
3. **Stripe.js loaded on every visit to `/jobs`** and three other pages,
   including its fingerprinting frames, because `loadStripe()` ran at module
   load. That's wasted bandwidth and third-party tracking for visitors who
   never pay.

## Changes (`perf/latency`)

- Job detail: served from the same 60 s cache as the list. On a cache miss
  it makes a single read; the view count is updated after the response is
  sent, so every view is still counted.
- Blog list and post: 60 s in-memory cache (`lib/ttl-cache.ts`).
- Stripe.js: loaded by `lib/stripe.ts` the first time a payment form or a
  Stripe redirect needs it.

Expected effect once deployed: job detail and blog requests drop from about
1 s to about 110 ms when cached and about 0.5 s when not; `/jobs` stops
loading Stripe.js. Confirm by re-running the script and the browser
measurement after deployment, under the same conditions as the baseline.

## Not changed

- No database indexes were added: no query evidence points to a missing index.
  The cost is per round trip, not per row scanned (the database is 20 MB).
- Dashboard pages (behind login) weren't measured. That needs test accounts
  on a non-production environment.
