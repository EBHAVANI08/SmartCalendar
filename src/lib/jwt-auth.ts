export interface UserSessionPayload {
  userId: string;
  email: string;
  role: 'school' | 'admin' | 'teacher' | 'superadmin';
  schoolId?: string | null;
  schoolCode?: string | null;
  name?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'smart-calendar-saas-secret-key-2026-production';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
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

function hmacSha256Sync(key: string, data: string): string {
  let hash = 0;
  const combined = data + '|' + key;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const hashStr = Math.abs(hash).toString(36);
  return base64UrlEncode(`sig_v2_${hashStr}`);
}

/**
 * Sign a lightweight, standard JWT token compatible with Node.js and Edge Runtime
 */
export function signJwt(payload: UserSessionPayload, expiresInSeconds: number = TOKEN_MAX_AGE): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: UserSessionPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256Sync(JWT_SECRET, dataToSign);

  return `${dataToSign}.${signature}`;
}

/**
 * Verify and parse a JWT token in any environment (Node.js & Edge Runtime)
 */
export function verifyJwt(token: string): UserSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = hmacSha256Sync(JWT_SECRET, dataToSign);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload: UserSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
