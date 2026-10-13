/**
 * Counts failures (or requests) per key in a time window and pauses the key
 * once a limit is reached. In memory, per server process: the app runs as one
 * pm2 process, so this covers every request; a restart clears the counts.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

function current(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

/** Seconds until the key may try again, or 0 when it is not paused. */
export function pausedFor(key: string, limit: number): number {
  const bucket = current(key);
  if (!bucket || bucket.count < limit) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}

/** Records one failure/request for the key. */
export function record(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = current(key, now) ?? { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count;
}

export function clear(key: string) {
  buckets.delete(key);
}

/** The caller's network address as seen through Cloudflare / the proxy. */
export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  );
}
