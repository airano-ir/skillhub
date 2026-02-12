'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';

interface EarlyAccessFormProps {
  variant: 'a' | 'b';
  locale: string;
}

export function EarlyAccessForm({ variant, locale }: EarlyAccessFormProps) {
  const t = useTranslations('claudePlugin');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setErrorMessage(t('form.invalidEmail'));
      setStatus('error');
      return;
    }

    setStatus('loading');

    try {
      const response = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          variant,
          locale,
          source: 'claude-plugin-landing',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      setStatus('success');
      setEmail('');

    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('form.genericError'));
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        <p className="text-green-800 dark:text-green-300 font-medium text-center">
          {t('form.successMessage')}
        </p>
        <p className="text-green-600 dark:text-green-400 text-sm text-center">
          {t('form.successDescription')}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === 'error') setStatus('idle');
            }}
            placeholder={t('form.emailPlaceholder')}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            disabled={status === 'loading'}
          />
        </div>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-6 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : null}
          {variant === 'a' ? t('form.ctaA') : t('form.ctaB')}
        </button>
      </div>

      {status === 'error' && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}

      <p className="text-text-secondary text-xs text-center">
        {t('form.privacyNote')}
      </p>
    </form>
  );
}
