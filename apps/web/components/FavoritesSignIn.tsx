'use client';

import { signIn } from 'next-auth/react';
import { Github } from 'lucide-react';

interface FavoritesSignInProps {
  translations: {
    loginRequired: string;
    signIn: string;
  };
}

export function FavoritesSignIn({ translations }: FavoritesSignInProps) {
  return (
    <div className="card p-8 text-center">
      <Github className="w-12 h-12 mx-auto mb-4 text-text-muted" />
      <p className="text-text-secondary mb-6">{translations.loginRequired}</p>
      <button
        onClick={() => signIn('github')}
        className="btn-primary inline-flex items-center gap-2"
      >
        <Github className="w-5 h-5" />
        {translations.signIn}
      </button>
    </div>
  );
}
