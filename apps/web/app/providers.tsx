'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { CsrfProvider } from '@/components/CsrfProvider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <CsrfProvider>
          {children}
        </CsrfProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
