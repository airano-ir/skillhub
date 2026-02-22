import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { NewSkillsTabs } from '@/components/NewSkillsTabs';
import { SkillCard } from '@/components/SkillCard';
import { Clock, RefreshCw } from 'lucide-react';
import { createDb, skillQueries } from '@skillhub/db';
import { toPersianNumber } from '@/lib/format-number';
import { Pagination } from '@/components/BrowseFilters';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

interface NewSkillsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}

// Format date to "X hours/days ago" with locale support
function formatTimeAgo(date: Date | null, locale: string): string {
  if (!date) return locale === 'fa' ? 'اخیراً' : 'Recently';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (locale === 'fa') {
    if (diffDays > 0) return `${toPersianNumber(diffDays)} روز پیش`;
    if (diffHours > 0) return `${toPersianNumber(diffHours)} ساعت پیش`;
    return 'همین الان';
  }

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

// Get skills based on tab with pagination and Redis caching (30 min TTL)
async function getSkillsForTab(tab: 'new' | 'updated', page: number, limit: number) {
  try {
    return await getOrSetCache(cacheKeys.newSkills(tab, page), cacheTTL.newSkills, async () => {
      const db = createDb();
      const offset = (page - 1) * limit;

      if (tab === 'new') {
        const skills = await skillQueries.getNewSkills(db, limit, offset);
        const total = await skillQueries.countNewSkills(db);
        return { skills, total };
      } else {
        const skills = await skillQueries.getUpdatedSkills(db, limit, offset);
        const total = await skillQueries.countUpdatedSkills(db);
        return { skills, total };
      }
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return { skills: [], total: 0 };
  }
}

// Get counts for both tabs with Redis caching (30 min TTL)
async function getTabCounts() {
  try {
    return await getOrSetCache(cacheKeys.newSkillsCounts(), cacheTTL.newSkills, async () => {
      const db = createDb();
      const [newCount, updatedCount] = await Promise.all([
        skillQueries.countNewSkills(db),
        skillQueries.countUpdatedSkills(db),
      ]);
      return { newCount, updatedCount };
    });
  } catch (error) {
    console.error('Error fetching counts:', error);
    return { newCount: 0, updatedCount: 0 };
  }
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/new'),
  };
}

export default async function NewSkillsPage({
  params,
  searchParams,
}: NewSkillsPageProps) {
  const { locale } = await params;
  const searchParamsResolved = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('new');
  const tBrowse = await getTranslations('browse');

  const limit = 12;
  const page = parseInt(searchParamsResolved.page || '1');
  const tab = (searchParamsResolved.tab as 'new' | 'updated') || 'new';

  // Fetch data in parallel
  const [{ skills, total }, { newCount, updatedCount }] = await Promise.all([
    getSkillsForTab(tab, page, limit),
    getTabCounts(),
  ]);

  const totalPages = Math.ceil(total / limit);

  const startItem = total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, total);

  const paginationTranslations = {
    previous: tBrowse('pagination.previous'),
    next: tBrowse('pagination.next'),
    page: tBrowse('pagination.page'),
    of: tBrowse('pagination.of'),
  };

  const tabsTranslations = {
    new: t('tabs.new'),
    updated: t('tabs.updated'),
    newDescription: t('newDescription'),
    updatedDescription: t('updatedDescription'),
  };

  const noSkillsMessage = tab === 'new' ? t('noNewSkills') : t('noUpdatedSkills');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main">
            {/* Tabs Component */}
            <NewSkillsTabs
              activeTab={tab}
              newCount={newCount}
              updatedCount={updatedCount}
              locale={locale}
              translations={tabsTranslations}
            />

            {/* Results count */}
            {total > 0 && (
              <p className="text-text-secondary mb-6 text-center">
                {tBrowse('resultsRange', {
                  start: locale === 'fa' ? toPersianNumber(startItem) : startItem,
                  end: locale === 'fa' ? toPersianNumber(endItem) : endItem,
                  total: locale === 'fa' ? toPersianNumber(total) : total
                })}
              </p>
            )}

            {/* Skills Grid */}
            {skills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {skills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    locale={locale}
                    showTimeBadge={tab === 'new' ? 'created' : 'updated'}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-elevated flex items-center justify-center">
                  {tab === 'new' ? (
                    <Clock className="w-8 h-8 text-text-muted" />
                  ) : (
                    <RefreshCw className="w-8 h-8 text-text-muted" />
                  )}
                </div>
                <p className="text-text-secondary text-lg">{noSkillsMessage}</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                locale={locale}
                translations={paginationTranslations}
              />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
