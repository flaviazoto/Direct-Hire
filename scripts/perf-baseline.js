// Usage: node scripts/perf-baseline.js [samplesPerUrl=20]  — see docs/PERFORMANCE.md
// Read-only latency baseline for public production endpoints.
// Sequential requests with a pause, well under rate limits. No auth, no writes.
const N = Number(process.argv[2] ?? 20);
const PAUSE_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstJobId() {
  const r = await fetch("https://api.directhire.cc/api/public/jobs?limit=1");
  const j = await r.json();
  return j?.data?.[0]?.id;
}

async function measure(url) {
  const ttfb = [], total = [];
  let bytes = 0, status = 0, cache = "";
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const r = await fetch(url, { headers: { "Accept-Encoding": "gzip, br" } });
    const t1 = performance.now();
    const buf = Buffer.from(await r.arrayBuffer());
    const t2 = performance.now();
    ttfb.push(t1 - t0); total.push(t2 - t0);
    bytes = buf.length; status = r.status; cache = r.headers.get("x-vercel-cache") ?? r.headers.get("cache-control") ?? "";
    await sleep(PAUSE_MS);
  }
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  return { url, status, n: N, ttfb_p50: Math.round(q(ttfb, 0.5)), ttfb_p95: Math.round(q(ttfb, 0.95)), total_p50: Math.round(q(total, 0.5)), total_p95: Math.round(q(total, 0.95)), kb: +(bytes / 1024).toFixed(1), cache: cache.slice(0, 40) };
}

(async () => {
  const jobId = await firstJobId();
  const urls = [
    "https://api.directhire.cc/health",
    "https://api.directhire.cc/api/public/config/pricing",
    "https://api.directhire.cc/api/public/jobs?limit=20",
    jobId && `https://api.directhire.cc/api/public/jobs/${jobId}`,
    "https://api.directhire.cc/api/public/jobs/categories",
    "https://api.directhire.cc/api/public/blog?limit=20",
    "https://www.directhire.cc/",
    "https://www.directhire.cc/jobs",
    "https://www.directhire.cc/login",
    "https://www.directhire.cc/api/public/jobs?limit=20",
  ].filter(Boolean);
  const out = [];
  for (const u of urls) { out.push(await measure(u)); }
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), samplesPerUrl: N, results: out }, null, 1));
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
