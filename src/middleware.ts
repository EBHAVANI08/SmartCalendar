import { NextResponse, type NextRequest } from 'next/server';
import { verifyJwt } from '@/lib/jwt-auth';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Bypass auth endpoints immediately
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);

  // Extract JWT token from cookie or Authorization header
  let token = request.cookies.get('smart_calendar_token')?.value;
  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  // Verify token and inject user & tenant context headers for database queries
  if (token) {
    try {
      const session = verifyJwt(token);
      if (session) {
        requestHeaders.set('x-user-id', session.userId);
        requestHeaders.set('x-user-role', session.role);
        requestHeaders.set('x-user-email', session.email);
        if (session.name) {
          requestHeaders.set('x-user-name', session.name);
        }
        if (session.schoolId) {
          requestHeaders.set('x-school-id', session.schoolId);
        }
        if (session.schoolCode) {
          requestHeaders.set('x-school-code', session.schoolCode);
        }
      }
    } catch {}
  }

  // Protect superadmin endpoints (login stays public so owners can authenticate)
  if (pathname.startsWith('/api/superadmin/') && pathname !== '/api/superadmin/login') {
    const role = requestHeaders.get('x-user-role');
    const saToken = request.nextUrl.searchParams.get('token');
    const validLegacyToken =
      saToken === 'sa_master_key_2026_dps_delhi' ||
      saToken === 'sa_dev_token_2026' ||
      Boolean(process.env.SUPERADMIN_TOKEN && saToken === process.env.SUPERADMIN_TOKEN);
    if (role !== 'superadmin' && !validLegacyToken) {
      return NextResponse.json({ error: 'Unauthorized. SuperAdmin privileges required.' }, { status: 401 });
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
