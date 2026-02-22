import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { createDb, skillQueries } from '@skillhub/db';
import { toPersianNumber } from '@/lib/format-number';
import { Pagination } from '@/components/BrowseFilters';
import { SkillCard } from '@/components/SkillCard';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

interface FeaturedPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}

// Get featured skills with pagination and Redis caching (2 hour TTL)
async function getFeaturedSkills(page: number, limit: number) {
  try {
    return await getOrSetCache(cacheKeys.featuredPage(page), cacheTTL.featured, async () => {
      const db = createDb();
      const offset = (page - 1) * limit;

      // Try featured first, fall back to combined popularity score
      let featuredSkills = await skillQueries.getFeatured(db, limit, offset);
      let total = await skillQueries.countFeatured(db);

      // If no featured skills, use adaptive popularity with owner/repo diversity
      if (total === 0) {
        featuredSkills = await skillQueries.getFeaturedWithDiversity(db, limit, 2, 3);
        total = await skillQueries.countAll(db);
      }

      return { skills: featuredSkills, total };
    });
  } catch (error) {
    console.error('Error fetching featured skills:', error);
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
    alternates: getPageAlternates(locale, '/featured'),
  };
}

export default async function FeaturedPage({
  params,
  searchParams,
}: FeaturedPageProps) {
  const { locale } = await params;
  const searchParamsResolved = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('featured');
  const tBrowse = await getTranslations('browse');

  const limit = 12;
  const page = parseInt(searchParamsResolved.page || '1');
  const { skills: featuredSkills, total } = await getFeaturedSkills(page, limit);
  const totalPages = Math.ceil(total / limit);

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const paginationTranslations = {
    previous: tBrowse('pagination.previous'),
    next: tBrowse('pagination.next'),
    page: tBrowse('pagination.page'),
    of: tBrowse('pagination.of'),
  };

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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  locale={locale}
                />
              ))}
            </div>

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
