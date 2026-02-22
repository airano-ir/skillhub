import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { createDb, skillQueries, categoryQueries } from '@skillhub/db';
import { BrowseFilters, SearchBar, Pagination, ActiveFilters, EmptyState } from '@/components/BrowseFilters';
import { SkillCard } from '@/components/SkillCard';
import { toPersianNumber } from '@/lib/format-number';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

interface BrowsePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    platform?: string;
    format?: string;
    sort?: string;
    page?: string;
  }>;
}

// Get skills directly from database with filters - all filtering at database level
async function getSkills(params: {
  q?: string;
  platform?: string;
  format?: string;
  sort?: string;
  page?: string;
  category?: string;
}) {
  try {
    const db = createDb();
    const limit = 20;
    const page = parseInt(params.page || '1');
    const offset = (page - 1) * limit;

    const sortMap: Record<string, 'stars' | 'downloads' | 'rating' | 'updated' | 'lastDownloaded'> = {
      'stars': 'stars',
      'downloads': 'downloads',
      'recent': 'updated',
      'rating': 'rating',
      'lastDownloaded': 'lastDownloaded',
    };

    // Build filter options - push ALL filters to database level
    const filterOptions = {
      query: params.q,
      category: params.category,
      platform: params.platform && params.platform !== 'all' ? params.platform : undefined,
      sourceFormat: params.format || 'skill.md',
      sortBy: sortMap[params.sort || 'lastDownloaded'] || 'lastDownloaded',
      sortOrder: 'desc' as const,
      limit,
      offset,
    };

    // Fetch paginated results directly from database
    const skills = await skillQueries.search(db, filterOptions);

    // Get accurate total count for pagination
    const total = await skillQueries.count(db, {
      query: params.q,
      category: params.category,
      platform: params.platform && params.platform !== 'all' ? params.platform : undefined,
      sourceFormat: params.format || 'skill.md',
    });

    const totalPages = Math.ceil(total / limit);

    return {
      skills,
      pagination: { total, page, totalPages },
    };
  } catch (error) {
    console.error('Error fetching skills:', error);
    return { skills: [], pagination: { total: 0, page: 1, totalPages: 1 } };
  }
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/browse'),
  };
}

export default async function BrowsePage({ params, searchParams }: BrowsePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const t = await getTranslations('browse');
  const tCommon = await getTranslations('common');

  const sortOptions = [
    { id: 'lastDownloaded', name: t('filters.sortOptions.lastDownloaded') },
    { id: 'downloads', name: t('filters.sortOptions.downloads') },
    { id: 'stars', name: t('filters.sortOptions.stars') },
    { id: 'recent', name: t('filters.sortOptions.recent') },
    { id: 'rating', name: t('filters.sortOptions.rating') },
  ];

  // Fetch categories hierarchically for filter dropdown with translations (cached 12h)
  const tCategories = await getTranslations('categories');
  type HierarchicalCategory = {
    id: string;
    name: string;
    slug: string;
    skillCount: number;
    children?: { id: string; name: string; slug: string; skillCount: number }[];
  };
  let categories: HierarchicalCategory[] = [];
  try {
    const rawCategories = await getOrSetCache(
      cacheKeys.categoriesHierarchical(),
      cacheTTL.categories,
      async () => {
        const db = createDb();
        return await categoryQueries.getHierarchical(db);
      }
    );
    categories = rawCategories.map(parent => ({
      id: parent.id,
      name: tCategories(`parents.${parent.slug}`) || parent.name,
      slug: parent.slug,
      skillCount: parent.skillCount ?? 0,
      children: parent.children?.map(cat => ({
        id: cat.id,
        name: tCategories(`names.${cat.slug}`) || cat.name,
        slug: cat.slug,
        skillCount: cat.skillCount ?? 0,
      })),
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
  }

  const filterTranslations = {
    category: t('filters.category') || 'Category',
    allCategories: t('filters.allCategories') || 'All Categories',
    sort: t('filters.sort'),
    format: t('filters.format') || 'Format',
    allFormats: t('filters.allFormats') || 'All Formats',
    agentSkills: t('filters.agentSkills') || 'Agent Skills (SKILL.md)',
    searching: t('searching') || 'Searching...',
    viewFeatured: t('filters.viewFeatured') || 'View Featured Skills',
  };

  const paginationTranslations = {
    previous: t('pagination.previous') || 'Previous',
    next: t('pagination.next') || 'Next',
    page: t('pagination.page') || 'Page',
    of: t('pagination.of') || 'of',
  };

  const activeFiltersTranslations = {
    search: t('activeFilters.search') || 'Search',
    category: t('activeFilters.category') || 'Category',
    sortBy: t('activeFilters.sortBy') || 'Sorted by',
    clearAll: t('activeFilters.clearAll') || 'Clear all',
  };

  const emptyStateTranslations = {
    noResults: t('noResults') || 'No skills found',
    noResultsWithQuery: t('noResultsWithQuery') || 'No results for "{query}"',
    tryDifferent: t('emptyState.tryDifferent') || 'Try different search terms or adjust your filters',
    clearFilters: t('emptyState.clearFilters') || 'Clear filters',
    browseAll: t('emptyState.browseAll') || 'Browse Featured Skills',
  };

  const searchPlaceholder = tCommon('search');

  // Fetch skills from API with all filters
  const { skills, pagination } = await getSkills(searchParamsResolved);
  const limit = 20;
  const startItem = (pagination.page - 1) * limit + 1;
  const endItem = Math.min(pagination.page * limit, pagination.total);

  // Get category name for active filters display
  const currentCategory = searchParamsResolved.category;
  const currentSort = searchParamsResolved.sort || 'lastDownloaded';
  const currentFormat = searchParamsResolved.format || '';
  const hasActiveFilters = !!(searchParamsResolved.q || currentCategory || (currentSort && currentSort !== 'lastDownloaded') || currentFormat);

  // Find category name from hierarchical categories
  let categoryName = '';
  if (currentCategory) {
    for (const parent of categories) {
      if (parent.id === currentCategory) {
        categoryName = parent.name;
        break;
      }
      const child = parent.children?.find(c => c.id === currentCategory);
      if (child) {
        categoryName = child.name;
        break;
      }
    }
  }

  // Find sort option name
  const sortName = sortOptions.find(o => o.id === currentSort)?.name || '';


  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        {/* Page Header */}
        <div className="bg-surface-elevated border-b border-border">
          <div className="container-main py-8">
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              {t('title')}
            </h1>
            <p className="text-text-secondary">
              {t('subtitle')}
            </p>
          </div>
        </div>

        <div className="container-main py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Filters Sidebar - Client Component */}
            <BrowseFilters
              sortOptions={sortOptions}
              categories={categories}
              locale={locale}
              translations={filterTranslations}
            />

            {/* Skills Grid */}
            <div className="flex-1">
              {/* Search Bar - Client Component */}
              <SearchBar
                placeholder={searchPlaceholder}
                defaultValue={searchParamsResolved.q}
              />

              {/* Active Filters - Shows applied filters as removable chips */}
              <ActiveFilters
                query={searchParamsResolved.q}
                categoryId={currentCategory}
                categoryName={categoryName}
                sortBy={currentSort}
                sortName={sortName}
                translations={activeFiltersTranslations}
              />

              {/* Results count with range */}
              {pagination.total > 0 && (
                <p className="text-text-secondary mb-6">
                  {t('resultsRange', {
                    start: locale === 'fa' ? toPersianNumber(startItem) : startItem,
                    end: locale === 'fa' ? toPersianNumber(endItem) : endItem,
                    total: locale === 'fa' ? toPersianNumber(pagination.total) : pagination.total
                  }) || `Showing ${startItem}-${endItem} of ${pagination.total} skills`}
                </p>
              )}

              {/* Skills Grid or Empty State */}
              {skills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {skills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      locale={locale}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  query={searchParamsResolved.q}
                  hasFilters={hasActiveFilters}
                  locale={locale}
                  translations={emptyStateTranslations}
                />
              )}

              {/* Pagination */}
              {skills.length > 0 && (
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  locale={locale}
                  translations={paginationTranslations}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
