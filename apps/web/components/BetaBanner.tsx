'use client';

import { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { formatCompactNumber } from '@/lib/format-number';

export function BetaBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [skillCount, setSkillCount] = useState<string | null>(null);
  const locale = useLocale();
  const t = useTranslations('banner');

  useEffect(() => {
    const dismissed = localStorage.getItem('promo-banner-dismissed');
    if (!dismissed) {
      setIsVisible(true);
    }

    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data.totalSkills) {
          setSkillCount(formatCompactNumber(data.totalSkills, locale));
        }
      })
      .catch(() => {});
  }, [locale]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('promo-banner-dismissed', 'true');
  };

  if (!isVisible) return null;

  const count = skillCount || (locale === 'fa' ? '۱۶k' : '16k');

  return (
    <div className="relative bg-gradient-to-r from-primary-600 to-primary-500 text-white">
      <div className="container-main py-2 px-4 flex items-center justify-center gap-2 text-sm">
        <Zap className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">{t('text', { count })}</span>
        <span className="hidden sm:inline text-primary-100">|</span>
        <Link
          href={`/${locale}/support`}
          className="hidden sm:inline text-white underline underline-offset-2 hover:text-primary-100 transition-colors"
        >
          {t('feedback')}
        </Link>
        <button
          onClick={handleDismiss}
          className="absolute end-2 sm:end-4 p-1 hover:bg-white/10 rounded transition-colors"
          aria-label={t('dismiss')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
