'use client';

/**
 * Client-side CSRF utilities for @edge-csrf/nextjs
 *
 * The CSRF token is received in the 'x-csrf-token' response header from the server.
 * We store it in memory and include it in subsequent requests.
 * For API requests, include the token in the 'x-csrf-token' header.
 * For form submissions, include it in a hidden field named '_csrf'.
 */

const CSRF_HEADER_NAME = 'x-csrf-token';

// Store the CSRF token in memory (will be populated on first page load)
let csrfToken: string | null = null;

// Pending initialization promise (deduplicates concurrent init calls)
let initPromise: Promise<string | null> | null = null;

/**
 * Set the CSRF token (called when receiving a response with the token)
 */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/**
 * Get the current CSRF token
 */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/**
 * Create headers object with CSRF token included
 * Use this when making fetch requests
 */
export function createHeadersWithCsrf(additionalHeaders?: HeadersInit): Headers {
  const headers = new Headers(additionalHeaders);
  const token = getCsrfToken();

  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  return headers;
}

/**
 * Ensure the CSRF token is available, initializing if needed.
 * Deduplicates concurrent calls so only one GET /api/health fires.
 */
async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!initPromise) {
    initPromise = initializeCsrfToken().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

/**
 * Create a fetch wrapper that automatically includes the CSRF token
 * and extracts new tokens from responses
 */
export async function fetchWithCsrf(
  url: string | URL,
  options?: RequestInit
): Promise<Response> {
  // Wait for token to be ready before sending a protected request
  await ensureCsrfToken();

  const token = getCsrfToken();

  const headers = new Headers(options?.headers);

  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  // Ensure content-type is set for JSON requests if body is present
  if (options?.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Update token from response if present
  const newToken = response.headers.get(CSRF_HEADER_NAME);
  if (newToken) {
    setCsrfToken(newToken);
  }

  return response;
}

/**
 * Initialize CSRF token by making a request to any page/API
 * Call this early in your app (e.g., in a layout or provider)
 */
export async function initializeCsrfToken(): Promise<string | null> {
  try {
    // Make a simple GET request to get the CSRF token
    const response = await fetch('/api/health', {
      method: 'GET',
      credentials: 'same-origin',
    });

    const token = response.headers.get(CSRF_HEADER_NAME);
    if (token) {
      setCsrfToken(token);
    }
    return token;
  } catch {
    console.warn('Failed to initialize CSRF token');
    return null;
  }
}

/**
 * Get the header name for CSRF token (useful for custom request libraries)
 */
export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}

/**
 * Export constants for use in forms
 */
export const CSRF_FIELD_NAME = '_csrf';
