import Link from 'next/link';
import { Star, Download, Shield, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format-number';

const FORMAT_BADGE_LABELS: Record<string, string> = {
  'agents.md': 'AGENTS.md',
  'cursorrules': '.cursorrules',
  'windsurfrules': '.windsurfrules',
  'copilot-instructions': 'Copilot',
};

interface SkillCardProps {
  skill: {
    id: string;
    name: string;
    description: string | null;
    githubOwner: string;
    githubStars: number | null;
    downloadCount: number | null;
    rating: number | null;
    ratingCount: number | null;
    securityStatus: string | null;
    isVerified: boolean | null;
    sourceFormat?: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  };
  locale: string;
  /** Show time badge (for New Skills page) */
  showTimeBadge?: 'created' | 'updated' | null;
  /** Format time as "X days ago" */
  formatTimeAgo?: (date: Date | null, locale: string) => string;
}

export function SkillCard({ skill, locale, showTimeBadge, formatTimeAgo }: SkillCardProps) {
  const getSecurityColor = (status: string | null) => {
    switch (status) {
      case 'pass': return 'text-success';
      case 'warning': return 'text-warning';
      case 'fail': return 'text-error';
      default: return 'text-text-muted';
    }
  };

  const getSecurityLabel = (status: string | null) => {
    switch (status) {
      case 'pass': return '✓';
      case 'warning': return '⚠';
      case 'fail': return '✕';
      default: return '-';
    }
  };

  const showRating = (skill.ratingCount ?? 0) >= 3;

  return (
    <Link
      href={`/${locale}/skill/${skill.id}`}
      className="card p-6 border border-transparent hover:border-primary-200 transition-colors"
    >
      {/* Time Badge (for New Skills page) */}
      {showTimeBadge && formatTimeAgo && (
        <div className="flex items-center gap-2 text-xs mb-3">
          {showTimeBadge === 'created' ? (
            <span className="flex items-center gap-1 text-success">
              <Clock className="w-3 h-3" />
              <span>{formatTimeAgo(skill.createdAt ?? null, locale)}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-primary-500">
              <RefreshCw className="w-3 h-3" />
              <span>{formatTimeAgo(skill.updatedAt ?? null, locale)}</span>
            </span>
          )}
        </div>
      )}

      {/* Header: Name + Verified + Format Badge + Security */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-text-primary truncate">
            {skill.name}
          </h3>
          {skill.isVerified && (
            <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
          )}
          {skill.sourceFormat && skill.sourceFormat !== 'skill.md' && FORMAT_BADGE_LABELS[skill.sourceFormat] && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-subtle text-text-muted border border-border flex-shrink-0">
              {FORMAT_BADGE_LABELS[skill.sourceFormat]}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1 flex-shrink-0 ${getSecurityColor(skill.securityStatus)}`}>
          <Shield className="w-4 h-4" />
          <span className="text-sm font-medium">{getSecurityLabel(skill.securityStatus)}</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-text-secondary text-sm line-clamp-2 mb-4" dir="auto">
        {skill.description}
      </p>

      {/* Metadata Row: Stars + Downloads + Rating */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted mb-2">
        <span className="flex items-center gap-1">
          <Star className="w-4 h-4" />
          <span className="ltr-nums">{formatCompactNumber(skill.githubStars || 0, locale)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Download className="w-4 h-4" />
          <span className="ltr-nums">{formatCompactNumber(skill.downloadCount || 0, locale)}</span>
        </span>
        {showRating && (
          <span className="flex items-center gap-1 text-gold">
            <Star className="w-4 h-4 fill-current" />
            <span className="ltr-nums">{skill.rating?.toFixed(1)}</span>
            <span className="text-text-muted">({skill.ratingCount})</span>
          </span>
        )}
      </div>

      {/* Author */}
      <div className="text-sm text-text-muted">
        @{skill.githubOwner}
      </div>
    </Link>
  );
}
