// backend/src/lib/job-schedule.ts
// How often each scheduled job is expected to log a JobRunLog row. Shared by
// the admin System Health page and the health monitor's missing-job alert.

export const EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  "health-monitor":                 15,
  "lock-expiry-processor":          60,
  "storage-cleanup":                60,
  "lock-daily-billing":             24 * 60,
  "subscription-expiry-warnings":   24 * 60,
  "match-score-recalc":             24 * 60,
  "onboarding-reminders":           24 * 60,
};
