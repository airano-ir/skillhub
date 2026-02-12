import { createCsrfProtect, CsrfError } from '@edge-csrf/nextjs';
import { NextResponse } from 'next/server';

// CSRF token configuration
// Using double submit cookie pattern:
// - Secret is stored in httpOnly cookie (secure from XSS)
// - Token is stored in a readable cookie for JavaScript access
export const csrfProtect = createCsrfProtect({
  cookie: {
    // Secret cookie settings (httpOnly - not readable by JS)
    name: '__csrf_secret',
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  // Token settings
  token: {
    // Response header where token is sent back to client
    responseHeader: 'x-csrf-token',
  },
});

// Error response for CSRF validation failure
export function createCsrfErrorResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'CSRF token validation failed',
      code: 'CSRF_ERROR',
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
    },
    { status: 403 }
  );
}

// Check if request method requires CSRF protection
export function requiresCsrfProtection(method: string): boolean {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  return !safeMethods.includes(method.toUpperCase());
}

// Check if path should be protected
export function shouldProtectPath(pathname: string): boolean {
  // Only protect API routes
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  // List of API routes that need CSRF protection (state-changing)
  const protectedRoutes = [
    '/api/favorites',       // POST (add), DELETE (remove)
    '/api/favorites/check', // POST (batch check - read-like but uses POST)
    '/api/ratings',         // POST (submit rating)
    '/api/skills/removal-request', // POST (request removal)
    '/api/skills/add-request',     // POST (request addition)
  ];

  // Check if the pathname matches any protected route
  return protectedRoutes.some((route) => pathname.startsWith(route));
}

// Export the CsrfError type for error handling
export { CsrfError };
