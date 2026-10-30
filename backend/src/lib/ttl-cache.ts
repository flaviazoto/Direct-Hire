// backend/src/lib/ttl-cache.ts
// Tiny per-process cache for public, non-personal responses. Entries expire
// after ttlMs; the oldest entry is evicted beyond maxEntries.

export class TtlCache<T = unknown> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private ttlMs: number, private maxEntries: number) {}

  get(key: string): T | null {
    const e = this.entries.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.entries.delete(key); return null; }
    return e.value;
  }

  clear(): void {
    this.entries.clear();
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
