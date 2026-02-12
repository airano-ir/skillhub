'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Heart,
  Star,
  Download,
  Shield,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { FavoriteButton } from './FavoriteButton';

interface Skill {
  id: string;
  name: string;
  description: string | null;
  githubOwner: string;
  githubStars: number | null;
  downloadCount: number | null;
  securityStatus: string | null;
  isVerified: boolean | null;
  compatibility: { platforms?: string[] } | null;
}

interface FavoriteItem {
  skill: Skill;
}

interface FavoritesListProps {
  initialFavorites: FavoriteItem[];
  locale: string;
  translations: {
    verified: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyCta: string;
  };
}

export function FavoritesList({ initialFavorites, locale, translations }: FavoritesListProps) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(initialFavorites);

  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  const formatNumber = (num: number | null): string => {
    if (num === null) return '0';
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const handleToggleFavorite = useCallback((skillId: string, isFavorited: boolean) => {
    if (!isFavorited) {
      // Remove from list when unfavorited
      setFavorites(prev => prev.filter(item => item.skill.id !== skillId));
    }
  }, []);

  if (favorites.length === 0) {
    return (
      <div className="text-center py-16">
        <Heart className="w-16 h-16 text-text-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {translations.emptyTitle}
        </h2>
        <p className="text-text-secondary mb-6">{translations.emptyDescription}</p>
        <Link href={`/${locale}/browse`} className="btn-primary gap-2">
          {translations.emptyCta}
          <ArrowIcon className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {favorites.map(({ skill }) => (
        <div
          key={skill.id}
          className="card p-6 relative border border-transparent hover:border-primary-200 transition-all"
        >
          {/* Favorite button in corner */}
          <div className="absolute top-4 end-4">
            <FavoriteButton
              skillId={skill.id}
              initialFavorited={true}
              size="sm"
              onToggle={(isFavorited) => handleToggleFavorite(skill.id, isFavorited)}
            />
          </div>

          <Link href={`/${locale}/skill/${skill.id}`}>
            <div className="flex items-start gap-3 mb-3 pe-8">
              <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-primary-600">
                  {skill.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-text-primary truncate">
                  {skill.name}
                </h3>
                <p className="text-sm text-text-muted">@{skill.githubOwner}</p>
              </div>
            </div>

            <p className="text-sm text-text-secondary line-clamp-2 mb-4" dir="auto">
              {skill.description ?? ''}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span className="flex items-center gap-1 ltr-nums">
                <Star className="w-4 h-4 text-warning" />
                {formatNumber(skill.githubStars)}
              </span>
              <span className="flex items-center gap-1 ltr-nums">
                <Download className="w-4 h-4 text-primary-500" />
                {formatNumber(skill.downloadCount)}
              </span>
              <span className={`flex items-center gap-1 ${skill.securityStatus === 'pass' ? 'text-success' : skill.securityStatus === 'warning' ? 'text-warning' : 'text-text-muted'}`}>
                <Shield className="w-4 h-4" />
                {skill.securityStatus === 'pass' ? '✓' : skill.securityStatus === 'warning' ? '⚠' : '-'}
              </span>
              {skill.isVerified && (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle className="w-4 h-4" />
                  {translations.verified}
                </span>
              )}
            </div>

            {/* Platforms */}
            {skill.compatibility?.platforms && skill.compatibility.platforms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {skill.compatibility.platforms.map((platform) => (
                  <span
                    key={platform}
                    className="px-2 py-0.5 bg-primary-50 text-primary-600 text-xs font-medium rounded"
                  >
                    {platform}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </div>
      ))}
    </div>
  );
}
