import Redis from "ioredis";

type RedisSetMode = "EX";

interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: RedisSetMode, seconds?: number): Promise<string>;
}

let client: Redis | null = null;
let warnedFallback = false;

const memory = new Map<string, { value: string; expiresAt?: number }>();

function nowMs() {
  return Date.now();
}

function purgeExpired(key: string) {
  const item = memory.get(key);
  if (item?.expiresAt && item.expiresAt <= nowMs()) {
    memory.delete(key);
  }
}

function getClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    client.on("error", (error) => {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn("[Redis] Falling back to in-memory store:", error.message);
      }
    });
  }
  return client;
}

async function withRedis<T>(operation: (redis: Redis) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  const redisClient = getClient();
  if (!redisClient) return fallback();
  try {
    if (redisClient.status === "wait") {
      await redisClient.connect();
    }
    return await operation(redisClient);
  } catch (error) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn("[Redis] Falling back to in-memory store:", error instanceof Error ? error.message : error);
    }
    return fallback();
  }
}

export const redis: RedisLike = {
  incr(key) {
    return withRedis(
      (r) => r.incr(key),
      async () => {
        purgeExpired(key);
        const current = parseInt(memory.get(key)?.value ?? "0", 10) + 1;
        const existing = memory.get(key);
        memory.set(key, { value: String(current), expiresAt: existing?.expiresAt });
        return current;
      },
    );
  },

  expire(key, seconds) {
    return withRedis(
      (r) => r.expire(key, seconds),
      async () => {
        purgeExpired(key);
        const item = memory.get(key);
        if (!item) return 0;
        memory.set(key, { ...item, expiresAt: nowMs() + seconds * 1000 });
        return 1;
      },
    );
  },

  ttl(key) {
    return withRedis(
      (r) => r.ttl(key),
      async () => {
        purgeExpired(key);
        const item = memory.get(key);
        if (!item) return -2;
        if (!item.expiresAt) return -1;
        return Math.max(0, Math.ceil((item.expiresAt - nowMs()) / 1000));
      },
    );
  },

  del(key) {
    return withRedis(
      (r) => r.del(key),
      async () => {
        const existed = memory.delete(key);
        return existed ? 1 : 0;
      },
    );
  },

  get(key) {
    return withRedis(
      (r) => r.get(key),
      async () => {
        purgeExpired(key);
        return memory.get(key)?.value ?? null;
      },
    );
  },

  set(key, value, mode, seconds) {
    return withRedis(
      (r) => mode === "EX" && seconds ? r.set(key, value, "EX", seconds) : r.set(key, value),
      async () => {
        memory.set(key, {
          value,
          expiresAt: mode === "EX" && seconds ? nowMs() + seconds * 1000 : undefined,
        });
        return "OK";
      },
    );
  },
};
