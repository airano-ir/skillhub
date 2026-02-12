import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';
import { csrfProtect, CsrfError, shouldProtectPath, requiresCsrfProtection, createCsrfErrorResponse } from './lib/csrf';

// Create the internationalization middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});



export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, method } = {
    pathname: request.nextUrl.pathname,
    method: request.method,
  };

  // Let next-auth handle its own routes without any middleware interference.
  // This is critical: creating a NextResponse.next() and setting cookies on it
  // can break next-auth's PKCE cookie flow (code_verifier gets lost).
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }


  // Handle CSRF protection for API routes
  if (shouldProtectPath(pathname) && requiresCsrfProtection(method)) {
    // Create a response to pass to csrfProtect (needed for cookie setting)
    const response = NextResponse.next();

    try {
      // Validate CSRF token
      await csrfProtect(request, response);
    } catch (err) {
      if (err instanceof CsrfError) {
        console.warn(`CSRF validation failed for ${method} ${pathname}`);
        return createCsrfErrorResponse();
      }
      // Re-throw unexpected errors
      throw err;
    }

    // CSRF validation passed, continue with the request
    // Return the response with any CSRF-related cookies set
    return response;
  }

  // For API routes that don't need CSRF protection, pass through
  if (pathname.startsWith('/api/')) {
    // Still set CSRF token cookie for GET requests so clients can get the token
    const response = NextResponse.next();
    try {
      await csrfProtect(request, response);
    } catch {
      // Ignore CSRF errors for safe methods - we just want to set the cookie
    }
    return response;
  }

  // For non-API routes, apply i18n middleware
  // Also set CSRF token cookie on page loads
  const intlResponse = intlMiddleware(request);

  try {
    // Apply CSRF to set the token cookie (won't validate since it's a safe method)
    await csrfProtect(request, intlResponse);
  } catch {
    // Ignore CSRF errors for page loads - we just want to set the cookie
  }

  return intlResponse;
}

export const config = {
  // Match all paths except static files and internal Next.js paths
  matcher: [
    // Match root
    '/',
    // Match locale paths
    '/(en|fa)/:path*',
    // Match API routes (for CSRF protection)
    '/api/:path*',
    // Match other paths (exclude static files and Next.js internals)
    '/((?!_next|_vercel|.*\\..*).*)',
  ],
};
