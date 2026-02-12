'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { Star, ExternalLink } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

const isMirror = process.env.NEXT_PUBLIC_IS_PRIMARY === 'false';
const PRIMARY_URL = process.env.NEXT_PUBLIC_PRIMARY_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

interface RatingStarsProps {
  skillId: string;
  initialRating?: number;
  averageRating?: number;
  ratingCount?: number;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  onRatingChange?: (rating: number) => void;
}

export function RatingStars({
  skillId,
  initialRating = 0,
  averageRating = 0,
  ratingCount = 0,
  readOnly = false,
  size = 'md',
  showCount = true,
  onRatingChange,
}: RatingStarsProps) {
  const { data: session } = useSession();
  const locale = useLocale();
  const [userRating, setUserRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mirrorNotice, setMirrorNotice] = useState(false);

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

  const displayRating = readOnly
    ? averageRating
    : hoverRating || userRating || averageRating;

  const handleClick = useCallback(
    async (rating: number) => {
      if (readOnly) return;

      if (!session) {
        signIn('github');
        return;
      }

      if (isMirror) {
        setMirrorNotice(true);
        return;
      }

      const previousRating = userRating;
      setUserRating(rating); // Optimistic update
      setIsSubmitting(true);

      try {
        const res = await fetchWithCsrf('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skillId, rating }),
        });

        if (!res.ok) throw new Error('Failed to submit rating');

        onRatingChange?.(rating);
      } catch (error) {
        setUserRating(previousRating); // Rollback on error
        console.error('Rating error:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [readOnly, session, skillId, userRating, onRatingChange]
  );

  const mirrorMsg = locale === 'fa'
    ? 'برای امتیازدهی، از سایت اصلی استفاده کنید'
    : 'To rate skills, visit the main site';

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div
          dir="ltr"
          className={`flex items-center gap-0.5 ${!readOnly ? 'cursor-pointer' : ''}`}
          onMouseLeave={() => !readOnly && setHoverRating(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={readOnly || isSubmitting}
              onClick={() => handleClick(star)}
              onMouseEnter={() => !readOnly && setHoverRating(star)}
              className={`
                transition-colors
                ${readOnly ? 'cursor-default' : 'hover:scale-110'}
                ${isSubmitting ? 'opacity-50' : ''}
              `}
            >
              <Star
                className={`
                  ${sizeClasses[size]}
                  ${
                    star <= displayRating
                      ? 'fill-amber-400 text-amber-400'
                      : 'fill-transparent text-text-muted'
                  }
                `}
              />
            </button>
          ))}
        </div>
        {showCount && (
          <span className="text-sm text-text-secondary ltr-nums">({ratingCount})</span>
        )}
      </div>
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
    </div>
  );
}
