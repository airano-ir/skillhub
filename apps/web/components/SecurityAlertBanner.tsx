'use client';

import { useState, useEffect } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

const BLOG_POST_URL = 'https://blog.palebluedot.live/2026/03/19/malware-openclaw-skills-security-advisory/';
const STORAGE_KEY = 'security-alert-openclaw-dismissed';

export function SecurityAlertBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const t = useTranslations('securityAlert');

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="relative bg-error-bg border-b-2 border-error">
      <div className="container-main py-2.5 px-4 flex items-center justify-center gap-2 text-sm">
        <ShieldAlert className="w-4 h-4 text-error flex-shrink-0" />
        <span className="font-semibold text-error">{t('label')}</span>
        <span className="text-text-primary">{t('text')}</span>
        <a
          href={BLOG_POST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-error underline underline-offset-2 hover:text-error/80 transition-colors font-medium"
        >
          {t('link')}
        </a>
        <button
          onClick={handleDismiss}
          className="absolute end-2 sm:end-4 p-1 hover:bg-error/10 rounded transition-colors"
          aria-label={t('dismiss')}
        >
          <X className="w-4 h-4 text-error" />
        </button>
      </div>
    </div>
  );
}
