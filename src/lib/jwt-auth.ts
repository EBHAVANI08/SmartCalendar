export interface UserSessionPayload {
  userId: string;
  email: string;
  role: 'school' | 'admin' | 'teacher' | 'superadmin';
  schoolId?: string | null;
  schoolCode?: string | null;
  name?: string;
  ownerRole?: string | null;
  modules?: string | null;
  iat?: number;
  exp?: number;
}

const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const MIN_SECRET_LENGTH = 32;
const encoder = new TextEncoder();

/**
 * JWT_SECRET is required. There is deliberately no fallback value: a default
 * secret in source would let anyone mint a valid superadmin session offline.
 * Read lazily (not at module load) so `next build` can collect routes without
 * the runtime secret present — signing and verification still fail closed.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing or too short (must be >= 32 characters).');
    }
    console.warn('[SECURITY WARNING] JWT_SECRET is not configured or shorter than 32 chars. Set JWT_SECRET in .env.');
    return 'development_only_insecure_jwt_secret_key_minimum_length_32_chars';
  }
  return secret;
}

let cachedKey: { secret: string; key: CryptoKey } | null = null;

async function getKey(): Promise<CryptoKey> {
  const secret = getSecret();
  if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  cachedKey = { secret, key };
  return key;
}

function base64UrlFromBinary(bin: string): string {
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlEncode(str: string): string {
  const bytes = encoder.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return base64UrlFromBinary(bin);
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Real HMAC-SHA256 via WebCrypto — available in both the Edge and Node runtimes. */
async function hmacSha256(data: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return base64UrlFromBinary(bin);
}

/** Length-independent comparison, so a mismatch leaks no timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sign a standard HS256 JWT. Compatible with Node.js and the Edge Runtime.
 */
export async function signJwt(
  payload: UserSessionPayload,
  expiresInSeconds: number = TOKEN_MAX_AGE
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: UserSessionPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const dataToSign = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(fullPayload)
  )}`;

  return `${dataToSign}.${await hmacSha256(dataToSign)}`;
}

/**
 * Verify and parse a JWT. Returns null for anything untrusted — a bad or absent
 * signature, an unexpected algorithm, a malformed payload, or an expired token.
 */
export async function verifyJwt(token: string): Promise<UserSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    // Pin the algorithm: never let the token itself select "none" or a weaker alg.
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;

    const expected = await hmacSha256(`${encodedHeader}.${encodedPayload}`);
    if (!timingSafeEqual(signature, expected)) return null;

    const payload: UserSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (!payload.userId || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}
