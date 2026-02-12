'use client';

import { useEffect } from 'react';
import { initializeCsrfToken } from '@/lib/csrf-client';

interface CsrfProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes the CSRF token on mount.
 * This ensures the token is available for protected API requests.
 */
export function CsrfProvider({ children }: CsrfProviderProps) {
  useEffect(() => {
    // Initialize CSRF token on mount
    initializeCsrfToken();
  }, []);

  return <>{children}</>;
}
