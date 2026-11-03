// frontend/src/lib/public-stats.ts
// Live platform counts (GET /api/public/config/stats) for the sign-in and
// sign-up pages, shown rounded down ("40+") so they read naturally without
// ever overstating the real number.

import { useEffect, useState } from "react";

export interface PublicStats {
  verifiedWorkers: number;
  workerCountries: number;
  liveJobs: number;
  jobCountries: number;
  verifiedEmployers: number;
}

/** Rounded DOWN to a friendly figure: 7 → "7", 43 → "40+", 1,280 → "1,200+". */
export function approx(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 10) return String(n);
  const step = n < 100 ? 10 : n < 1000 ? 50 : n < 10000 ? 100 : 1000;
  const floored = Math.floor(n / step) * step;
  return `${floored.toLocaleString("en-US")}${floored < n ? "+" : ""}`;
}

let cached: PublicStats | null = null;

export function usePublicStats(): PublicStats | null {
  const [stats, setStats] = useState<PublicStats | null>(cached);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch("/api/public/config/stats")
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled || !j?.success) return;
        cached = j.data as PublicStats;
        setStats(cached);
      })
      .catch(() => { /* figures just stay as "—" */ });
    return () => { cancelled = true; };
  }, []);
  return stats;
}
