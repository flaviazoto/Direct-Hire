// frontend/src/lib/payments-flag.ts
// Client-side read of the backend PAYMENTS_ENABLED kill-switch, sourced from
// GET /api/public/config/pricing (see backend/src/controllers/public-config.controller.ts).
//
// Not wired into any component yet — this is flag plumbing only.

import { useEffect, useState } from "react";
import { publicConfigApi } from "./api-client";

interface PaymentsFlagState {
  enabled: boolean;
  loading: boolean;
}

// In-memory only (per tab session) — deliberately not localStorage, so a
// fresh page load always re-checks the current server-side flag state.
let cachedEnabled: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

async function fetchPaymentsEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  if (inFlight) return inFlight;

  inFlight = publicConfigApi.getPricing()
    .then((res) => {
      const data = (res as { success?: boolean; data?: { paymentsEnabled?: boolean } }).data;
      // Fail closed: any missing/malformed response is treated as disabled.
      const enabled = res.success === true && data?.paymentsEnabled === true;
      cachedEnabled = enabled;
      return enabled;
    })
    .catch(() => {
      cachedEnabled = false;
      return false;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function usePaymentsEnabled(): PaymentsFlagState {
  const [state, setState] = useState<PaymentsFlagState>({
    enabled: cachedEnabled ?? false,
    loading: cachedEnabled === null,
  });

  useEffect(() => {
    if (cachedEnabled !== null) {
      setState({ enabled: cachedEnabled, loading: false });
      return;
    }

    let cancelled = false;
    fetchPaymentsEnabled().then((enabled) => {
      if (!cancelled) setState({ enabled, loading: false });
    });

    return () => { cancelled = true; };
  }, []);

  return state;
}
