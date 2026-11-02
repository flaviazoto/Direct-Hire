# Monitoring

What watches DirectHire in production, what raises an alert, and how to tune or test it. Alerts go by email to `OWNER_EMAIL`. No paid service is required; Sentry is optional.

## Layers

| Layer | Runs where | Catches | Alert path |
|---|---|---|---|
| **External uptime** (`.github/workflows/uptime.yml`) | GitHub Actions, every 10 min | API down, crashed or unreachable; database unreachable | A failed workflow run. GitHub emails the repository owner. |
| **Health monitor** (`services/health-monitor/`) | Inside the API, every 15 min | The problems listed under Checks below | Email to `OWNER_EMAIL`, at most once per hour per problem. A recovery email follows when it clears. |
| **Server errors** (`middleware/error.middleware.ts`) | Every unexpected 500 | Code bugs and unhandled failures | Logged with a request ID in Railway logs, and sent to Sentry when `SENTRY_DSN` is set |
| **Browser errors** (`frontend/src/components/ErrorReporter.tsx` → `POST /api/client-errors`) | Users' browsers | JavaScript crashes on any page | `[client-error]` lines in Railway logs, and Sentry when it is set up |
| **CSP reports** (`/api/csp-report`) | Users' browsers | Content-Security-Policy violations (the policy is still report-only) | `[csp-report]` lines in Railway logs |
| **`/health`** | On request | Liveness, plus the deployed commit SHA | Used by the uptime check and by deploy verification |

The external check exists because the in-process monitor can't report its own crash. `www.directhire.cc` is not checked from GitHub: Vercel's bot protection answers GitHub's runners with a 403 challenge, which would trigger false alarms. Vercel's own status emails cover the frontend.

## Checks (health monitor)

These run every 15 minutes, alongside the existing endpoint, database and storage probes. Each run is written to `JobRunLog` as `health-monitor`, with the failing checks and their messages in `errorMessage`. The **admin System Health page** shows that latest run, and every log line is prefixed `[health-monitor]`.

| Check | Alerts when | Default threshold | Env var to override |
|---|---|---|---|
| `scheduled-jobs` | A job has not run within `interval × factor + grace`, or its latest run failed | factor 1.5, grace 15 min | `MONITOR_JOB_LATE_FACTOR`, `MONITOR_JOB_GRACE_MINUTES` |
| `upload-failures` | Uploads with status FAILED in the last hour | ≥ 1 | `MONITOR_UPLOAD_FAILURES_PER_HOUR` |
| `email-delivery` | FAILED or BOUNCED emails in the last hour (health-alert emails excluded) | ≥ 3 | `MONITOR_EMAIL_FAILURES_PER_HOUR` |
| `database-latency` | Average of 3 `SELECT 1` round trips | > 2000 ms | `MONITOR_DB_LATENCY_MS` |
| `database-connections` | Connections open on the database | > 40 | `MONITOR_DB_CONNECTIONS_MAX` |
| `memory` | API process RSS | > 450 MB | `MONITOR_RSS_MB` |
| `restarts` | API starts recorded in the last hour (`process-start` rows in `JobRunLog`) | ≥ 4 | `MONITOR_RESTARTS_PER_HOUR` |

Expected job intervals are defined in `backend/src/lib/job-schedule.ts`. That file is shared with the System Health page.

**These thresholds are provisional.** They are set for today's very low traffic. On 2 November 2026, production would have passed every check: all 7 jobs on schedule, 0 failed uploads or emails in the last hour, and 11 database connections. Revisit the thresholds once real traffic arrives. To change a threshold, set the env var on Railway. Each change needs a restart but no code change.

## Setting up Sentry (optional)

1. Create a free Sentry project (platform: Node.js / Express) and copy its DSN.
2. On Railway, set `SENTRY_DSN` to the DSN. Optionally set `SENTRY_ENVIRONMENT=production`.
3. Redeploy. The log shows `[error-tracking] Sentry enabled`.

Without `SENTRY_DSN` the integration does nothing. Only the request ID, method and path are attached to events. The SDK sends no cookies, request bodies or user data.

## Testing that alerts arrive

To confirm the full email path works:

1. Sign in as an admin.
2. Call `POST /api/admin/system/test-alert` (admin only).
3. Check that the `OWNER_EMAIL` inbox receives "test-alert".

The request is recorded in the audit log as `MONITORING_TEST_ALERT`.

To exercise the external check, run the **uptime** workflow manually from the GitHub Actions tab ("Run workflow").

## When an alert fires

1. Open the admin System Health page. The latest `health-monitor` run lists the failing checks and their messages.
2. Railway logs: search for the request ID (from a 500 response), `[client-error]` or `[health-monitor]`.
3. For a stopped job, use `GET /api/cron?job=<name>` with the `X-Cron-Secret` header to run it once by hand.
4. For a bad deploy, roll back (below).

## Rolling back a release

- **API (Railway):** open Deployments, pick the last good deployment, then choose **Redeploy**. Confirm `curl https://api.directhire.cc/health` reports that commit.
- **Frontend (Vercel):** open Deployments, pick the last good production deployment, then choose **Instant Rollback** (or Promote).
- **Git:** `git revert <bad commit>` and push to `main`, so the next auto-deploy doesn't bring the bad code back.
- **Database:** migrations are forward-only. This monitoring release adds none, so rolling it back needs no database step. For releases that do add migrations, see `docs/MIGRATIONS.md`.
