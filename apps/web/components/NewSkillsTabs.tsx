'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, RefreshCw } from 'lucide-react';

interface NewSkillsTabsProps {
  activeTab: 'new' | 'updated';
  newCount: number;
  updatedCount: number;
  locale: string;
  translations: {
    new: string;
    updated: string;
    newDescription: string;
    updatedDescription: string;
  };
}

export function NewSkillsTabs({
  activeTab,
  newCount,
  updatedCount,
  locale,
  translations,
}: NewSkillsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTabChange = (tab: 'new' | 'updated') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    params.delete('page'); // Reset to page 1 when switching tabs
    router.push(`/${locale}/new?${params.toString()}`);
  };

  const formatCount = (count: number) => {
    if (locale === 'fa') {
      return count.toLocaleString('fa-IR');
    }
    return count.toLocaleString('en-US');
  };

  return (
    <div className="mb-8">
      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-4">
        <button
          onClick={() => handleTabChange('new')}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all
            ${activeTab === 'new'
              ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
              : 'bg-surface-elevated text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
            }
          `}
        >
          <Sparkles className="w-4 h-4" />
          <span>{translations.new}</span>
          <span className={`
            px-2 py-0.5 rounded-full text-xs
            ${activeTab === 'new'
              ? 'bg-white/20 text-white'
              : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            }
          `}>
            {formatCount(newCount)}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('updated')}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all
            ${activeTab === 'updated'
              ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
              : 'bg-surface-elevated text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
            }
          `}
        >
          <RefreshCw className="w-4 h-4" />
          <span>{translations.updated}</span>
          <span className={`
            px-2 py-0.5 rounded-full text-xs
            ${activeTab === 'updated'
              ? 'bg-white/20 text-white'
              : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            }
          `}>
            {formatCount(updatedCount)}
          </span>
        </button>
      </div>

      {/* Description */}
      <p className="text-center text-text-muted text-sm">
        {activeTab === 'new' ? translations.newDescription : translations.updatedDescription}
      </p>
    </div>
  );
}
