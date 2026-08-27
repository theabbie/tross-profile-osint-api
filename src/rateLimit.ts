import { HttpError } from "./http.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(key: string, limit = 30, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new HttpError(429, "rate_limited", "Too many requests. Please retry shortly.");
  }

  bucket.count += 1;
}
