// backend/src/config/flags.ts
// Central home for boolean feature flags read from env. Payments default ON
// (unset === enabled) so existing deployments are unaffected until someone
// explicitly sets PAYMENTS_ENABLED=false.

export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "false";
}

export function applicationFeesDisabled(): boolean {
  return !paymentsEnabled() || process.env.DISABLE_APPLICATION_FEES === "true";
}
