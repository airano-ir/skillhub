import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { createDb, skillQueries } from '@skillhub/db';
import { toPersianNumber } from '@/lib/format-number';
import { Pagination } from '@/components/BrowseFilters';
import { SkillCard } from '@/components/SkillCard';
import { ReviewedSortSelector } from '@/components/ReviewedSortSelector';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';
import { Sparkles } from 'lucide-react';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

interface ReviewedPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; sort?: string; score?: string }>;
}

async function getReviewedSkillsData(sort: string, page: number, limit: number, minScore: number) {
  const validSort = (sort === 'aiScore' ? 'aiScore' : 'reviewDate') as 'reviewDate' | 'aiScore';
  try {
    return await getOrSetCache(cacheKeys.reviewedPage(validSort, page, minScore), cacheTTL.reviewed, async () => {
      const db = createDb();
      const offset = (page - 1) * limit;
      const [skills, total] = await Promise.all([
        skillQueries.getReviewedSkills(db, validSort, limit, offset, minScore),
        skillQueries.countReviewedSkills(db, minScore),
      ]);
      return { skills, total };
    });
  } catch (error) {
    console.error('Error fetching reviewed skills:', error);
    return { skills: [], total: 0 };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/reviewed'),
  };
}

export default async function ReviewedPage({
  params,
  searchParams,
}: ReviewedPageProps) {
  const { locale } = await params;
  const searchParamsResolved = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('reviewed');
  const tBrowse = await getTranslations('browse');

  const limit = 12;
  const page = parseInt(searchParamsResolved.page || '1');
  const sort = searchParamsResolved.sort || 'reviewDate';
  const minScore = searchParamsResolved.score === '0' ? 0 : 50;
  const { skills: reviewedSkills, total } = await getReviewedSkillsData(sort, page, limit, minScore);
  const totalPages = Math.ceil(total / limit);

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const paginationTranslations = {
    previous: tBrowse('pagination.previous'),
    next: tBrowse('pagination.next'),
    page: tBrowse('pagination.page'),
    of: tBrowse('pagination.of'),
  };

  const sortTranslations = {
    sortBy: t('sortBy'),
    reviewDate: t('sortOptions.reviewDate'),
    aiScore: t('sortOptions.aiScore'),
    scoreFilter: t('scoreFilter'),
    scoreAbove50: t('scoreOptions.above50'),
    scoreAll: t('scoreOptions.all'),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 mb-4">
              <Sparkles className="w-7 h-7" />
            </div>
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto mb-6">{t('subtitle')}</p>
            <p className="text-text-secondary text-sm max-w-3xl mx-auto leading-relaxed">
              {t('explanation')}
            </p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main">
            {/* Sort and results info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              {total > 0 && (
                <p className="text-text-secondary text-sm">
                  {tBrowse('resultsRange', {
                    start: locale === 'fa' ? toPersianNumber(startItem) : startItem,
                    end: locale === 'fa' ? toPersianNumber(endItem) : endItem,
                    total: locale === 'fa' ? toPersianNumber(total) : total
                  })}
                </p>
              )}
              <ReviewedSortSelector
                locale={locale}
                translations={sortTranslations}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviewedSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  locale={locale}
                />
              ))}
            </div>

            {total === 0 && (
              <p className="text-center text-text-muted py-12">
                {locale === 'fa' ? 'هنوز مهارتی بررسی نشده است.' : 'No reviewed skills yet.'}
              </p>
            )}

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              locale={locale}
              translations={paginationTranslations}
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
