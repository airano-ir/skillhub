'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { LogIn, LogOut, User, Heart, ChevronDown, Settings } from 'lucide-react';
import { clsx } from 'clsx';

export function AuthButton() {
  const { data: session, status } = useSession();
  const t = useTranslations('auth');
  const locale = useLocale();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-surface-subtle animate-pulse" />
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('github')}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors"
      >
        <LogIn className="w-4 h-4" />
        <span className="text-sm font-medium hidden sm:inline">{t('signIn')}</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors"
      >
        {session.user?.avatarUrl ? (
          <img
            src={session.user.avatarUrl}
            alt={session.user.username || 'User'}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-600" />
          </div>
        )}
        <ChevronDown className={clsx(
          'w-4 h-4 text-text-muted transition-transform',
          dropdownOpen && 'rotate-180'
        )} />
      </button>

      {dropdownOpen && (
        <div className="absolute end-0 top-full mt-2 w-48 bg-surface-elevated rounded-lg shadow-lg border border-border py-1 z-50">
          {/* User info */}
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm font-medium text-text-primary truncate">
              {session.user?.name || session.user?.username}
            </p>
            <p className="text-xs text-text-muted truncate">
              @{session.user?.username}
            </p>
          </div>

          {/* Menu items */}
          <Link
            href={`/${locale}/favorites`}
            onClick={() => setDropdownOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle transition-colors"
          >
            <Heart className="w-4 h-4" />
            {t('favorites')}
          </Link>

          <Link
            href={`/${locale}/claim`}
            onClick={() => setDropdownOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle transition-colors"
          >
            <Settings className="w-4 h-4" />
            {t('manageSkills')}
          </Link>

          <button
            onClick={() => {
              setDropdownOpen(false);
              signOut();
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
