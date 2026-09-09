import { NextResponse, type NextRequest } from 'next/server';
import { verifyJwt, type UserSessionPayload } from '@/lib/jwt-auth';
import { can, capabilityForPath, isKnownRole } from '@/lib/authz';

/**
 * Identity headers are derived from the verified session and nothing else.
 * They are stripped from every inbound request first, so a client cannot
 * hand itself a role or a tenant by simply setting the header.
 */
const IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-user-name',
  'x-school-id',
  'x-school-code',
  'x-tenant-id',
];

/**
 * Endpoints reachable without a session. Everything else under /api requires a
 * verified token, so tenant routes can never be queried anonymously — without
 * this an unauthenticated caller reaches handlers that scope by school id and
 * fall back to an unscoped, cross-tenant query when there is none.
 */
const PUBLIC_API_ROUTES: { path: string; methods: string[] }[] = [
  { path: '/api/health', methods: ['GET'] },
  { path: '/api/website', methods: ['GET'] },
  { path: '/api/superadmin/login', methods: ['POST'] },
];

/** Machine-to-machine callers that authenticate inside the handler itself. */
const PUBLIC_API_PREFIXES = ['/api/webhooks/'];

function isPublicApiRoute(pathname: string, method: string): boolean {
  if (pathname === '/api') return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return PUBLIC_API_ROUTES.some(
    (route) => route.path === pathname && route.methods.includes(method)
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Bypass auth endpoints immediately
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  for (const header of IDENTITY_HEADERS) {
    requestHeaders.delete(header);
  }

  // Extract JWT token from cookie or Authorization header
  let token = request.cookies.get('smart_calendar_token')?.value;
  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  // Verify token and inject user & tenant context headers for database queries
  let session: UserSessionPayload | null = null;
  if (token) {
    try {
      session = await verifyJwt(token);
    } catch {
      session = null;
    }
  }

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

  const configuredToken = process.env.SUPERADMIN_TOKEN;
  const authHeaderVal = request.headers.get('authorization');
  const serviceHeaderVal = request.headers.get('x-superadmin-token');
  const validServiceToken = Boolean(
    configuredToken &&
      configuredToken.length >= 32 &&
      (serviceHeaderVal === configuredToken ||
        (authHeaderVal?.startsWith('Bearer ') && authHeaderVal.substring(7).trim() === configuredToken))
  );

  // Protect superadmin endpoints (login stays public so owners can authenticate)
  if (pathname.startsWith('/api/superadmin/') && pathname !== '/api/superadmin/login') {
    if (session?.role !== 'superadmin' && !validServiceToken) {
      return NextResponse.json(
        { error: 'Unauthorized. SuperAdmin privileges required.' },
        { status: 401 }
      );
    }
  } else if (
    pathname.startsWith('/api/') &&
    !session &&
    !isPublicApiRoute(pathname, request.method)
  ) {
    // Tenant endpoints require a session, so school scoping can never be absent.
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Application pages.
  //
  // The API is the real boundary - every mutating route carries its own
  // capability guard. This is the coarse layer that stops a teacher who types
  // /teachers from landing on an admin screen that then 403s on every call.
  // Hiding a sidebar link was never authorization.
  if (!pathname.startsWith('/api/')) {
    const required = capabilityForPath(pathname);
    if (required) {
      if (!session) {
        const login = new URL('/login', request.url);
        login.searchParams.set('next', pathname);
        return NextResponse.redirect(login);
      }
      if (!isKnownRole(session.role) || !can(session.role, required)) {
        const home = new URL('/dashboard', request.url);
        home.searchParams.set('denied', pathname);
        return NextResponse.redirect(home);
      }
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/api/:path*',
    // The tenant application pages, so role checks are not client-side only.
    '/dashboard/:path*',
    '/timetable/:path*',
    '/timetable-versions/:path*',
    '/substitutions/:path*',
    '/leaves/:path*',
    '/teachers/:path*',
    '/attendance/:path*',
    '/subjects/:path*',
    '/day-config/:path*',
    '/rooms/:path*',
    '/calendar/:path*',
    '/support/:path*',
    '/settings/:path*',
    '/school-setup/:path*',
    '/analytics/:path*',
    '/lesson-plans/:path*',
    '/profile/:path*',
  ],
};
