'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Heart, ExternalLink } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

const isMirror = process.env.NEXT_PUBLIC_IS_PRIMARY === 'false';
const PRIMARY_URL = process.env.NEXT_PUBLIC_PRIMARY_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

interface FavoriteButtonProps {
  skillId: string;
  initialFavorited?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  onToggle?: (favorited: boolean) => void;
}

export function FavoriteButton({
  skillId,
  initialFavorited = false,
  size = 'md',
  showLabel = false,
  onToggle,
}: FavoriteButtonProps) {
  const { data: session, status } = useSession();
  const t = useTranslations('favorites');
  const locale = useLocale();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [mirrorNotice, setMirrorNotice] = useState(false);
  const pendingRef = useRef(false);

  // Fetch actual favorite status when user is authenticated
  useEffect(() => {
    if (initialFavorited || status !== 'authenticated') return;
    let cancelled = false;
    fetchWithCsrf('/api/favorites/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillIds: [skillId] }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.favorited?.[skillId]) {
          setIsFavorited(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [skillId, status, initialFavorited]);

  // Auto-dismiss mirror notice
  useEffect(() => {
    if (!mirrorNotice) return;
    const timer = setTimeout(() => setMirrorNotice(false), 4000);
    return () => clearTimeout(timer);
  }, [mirrorNotice]);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const buttonSizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  const handleToggle = useCallback(async () => {
    if (pendingRef.current) return;
    if (status === 'loading') return;

    if (!session) {
      signIn('github');
      return;
    }

    if (isMirror) {
      setMirrorNotice(true);
      return;
    }

    pendingRef.current = true;
    const newState = !isFavorited;
    setIsFavorited(newState); // Optimistic update
    setIsLoading(true);

    try {
      const res = await fetchWithCsrf('/api/favorites', {
        method: newState ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });

      if (!res.ok) throw new Error('Failed to update favorite');

      onToggle?.(newState);
    } catch (error) {
      setIsFavorited(!newState); // Rollback on error
      console.error('Favorite error:', error);
    } finally {
      pendingRef.current = false;
      setIsLoading(false);
    }
  }, [session, status, isFavorited, skillId, onToggle]);

  const mirrorMsg = locale === 'fa'
    ? 'برای افزودن به علاقه‌مندی‌ها، از سایت اصلی استفاده کنید'
    : 'To add favorites, visit the main site';

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading || status === 'loading'}
        aria-label={isFavorited ? t('remove') : t('add')}
        aria-pressed={isFavorited}
        title={!session && status !== 'loading' ? t('loginRequired') : (isFavorited ? t('remove') : t('add'))}
        className={`
          ${buttonSizeClasses[size]}
          rounded-lg transition-all duration-200
          hover:bg-red-50 dark:hover:bg-red-950 group
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
          ${showLabel ? 'flex items-center gap-2 px-3' : ''}
        `}
      >
        <Heart
          className={`
            ${sizeClasses[size]}
            transition-all duration-200
            ${
              isFavorited
                ? 'fill-red-500 text-red-500'
                : 'fill-transparent text-text-muted group-hover:text-red-500'
            }
          `}
        />
        {showLabel && (
          <span className="text-sm text-text-secondary">
            {isFavorited ? t('remove') : t('add')}
          </span>
        )}
      </button>
      {mirrorNotice && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200">
          <a
            href={PRIMARY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface-elevated border border-border rounded-lg shadow-lg text-text-primary hover:text-primary-500 transition-colors"
          >
            {mirrorMsg}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        </div>
      )}
    </span>
  );
}
