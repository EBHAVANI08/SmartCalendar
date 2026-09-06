import { verifyJwt, type UserSessionPayload } from '@/lib/jwt-auth';

/**
 * Session helpers for route handlers.
 *
 * Middleware already strips inbound identity headers and re-derives them from a
 * verified token, so `x-user-*` headers are trustworthy inside a route. These
 * helpers verify the token independently for the places where that guarantee
 * must not depend on middleware having run — chiefly the superadmin gate.
 */

const COOKIE_NAME = 'smart_calendar_token';

export function readSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    if (value) return decodeURIComponent(value);
  }
  return null;
}

/** Returns the verified session, or null for any absent/invalid/expired token. */
export async function getSession(request: Request): Promise<UserSessionPayload | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  try {
    return await verifyJwt(token);
  } catch {
    return null;
  }
}
