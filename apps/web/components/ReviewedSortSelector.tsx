'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

interface ReviewedSortSelectorProps {
  locale: string;
  translations: {
    sortBy: string;
    reviewDate: string;
    aiScore: string;
    scoreFilter: string;
    scoreAbove50: string;
    scoreAll: string;
  };
}

export function ReviewedSortSelector({ locale, translations }: ReviewedSortSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSort = searchParams.get('sort') || 'reviewDate';
  const currentScore = searchParams.get('score') || '50';

  const navigate = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/${locale}/reviewed?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label htmlFor="sort-select" className="text-sm text-text-secondary whitespace-nowrap">
          {translations.sortBy}
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => navigate({ sort: e.target.value })}
          disabled={isPending}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        >
          <option value="reviewDate">{translations.reviewDate}</option>
          <option value="aiScore">{translations.aiScore}</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="score-filter" className="text-sm text-text-secondary whitespace-nowrap">
          {translations.scoreFilter}
        </label>
        <select
          id="score-filter"
          value={currentScore}
          onChange={(e) => navigate({ score: e.target.value })}
          disabled={isPending}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        >
          <option value="50">{translations.scoreAbove50}</option>
          <option value="0">{translations.scoreAll}</option>
        </select>
      </div>
    </div>
  );
}
