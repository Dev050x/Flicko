import { Redis } from "@upstash/redis";

export interface NonceStore {
  put(nonce: string, wallet: string, ttlSeconds: number): Promise<void>;
  take(nonce: string): Promise<string | null>;
}

const key = (nonce: string) => `siws:nonce:${nonce}`;

export const upstashNonceStore = (url: string, token: string): NonceStore => {
  const redis = new Redis({ url, token });
  return {
    put: async (nonce, wallet, ttlSeconds) => {
      await redis.set(key(nonce), wallet, { ex: ttlSeconds });
    },
    take: (nonce) => redis.getdel<string>(key(nonce)),
  };
};

export const memoryNonceStore = (now: () => number = Date.now): NonceStore => {
  const entries = new Map<string, { wallet: string; expiresAt: number }>();
  return {
    put: async (nonce, wallet, ttlSeconds) => {
      entries.set(nonce, { wallet, expiresAt: now() + ttlSeconds * 1000 });
    },
    take: async (nonce) => {
      const entry = entries.get(nonce);
      entries.delete(nonce);
      return entry && entry.expiresAt > now() ? entry.wallet : null;
    },
  };
};
