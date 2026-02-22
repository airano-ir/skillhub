'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useState, useTransition, useEffect, type FormEvent } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Loader2, X, Star, SlidersHorizontal, Sparkles } from 'lucide-react';
import Link from 'next/link';

// Persian number conversion
const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianNumber(num: number | string): string {
  return String(num).replace(/\d/g, (d) => persianDigits[parseInt(d, 10)]);
}

interface SortOption {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  skillCount: number;
  parentId?: string | null;
}

interface HierarchicalCategory extends Category {
  children?: Category[];
}

interface BrowseFiltersProps {
  sortOptions: SortOption[];
  categories: Category[] | HierarchicalCategory[];
  locale?: string;
  translations: {
    category: string;
    allCategories: string;
    sort: string;
    format?: string;
    allFormats?: string;
    agentSkills?: string;
    searching: string;
    viewFeatured?: string;
  };
}

export function BrowseFilters({
  sortOptions,
  categories,
  locale = 'en',
  translations,
}: BrowseFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  // Get current values from URL
  const currentCategory = searchParams.get('category') || '';
  const currentSort = searchParams.get('sort') || 'lastDownloaded';
  const currentFormat = searchParams.get('format') || '';

  // Count active filters for mobile badge
  const activeFilterCount = [
    currentCategory ? 1 : 0,
    currentSort !== 'lastDownloaded' ? 1 : 0,
    currentFormat ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Update URL with new params
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || value === 'false') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset page when filters change
      params.delete('page');

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    updateParams({ category: categoryId === '' ? null : categoryId });
  };

  // Handle sort change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ sort: e.target.value === 'lastDownloaded' ? null : e.target.value });
  };

  // Handle format change
  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ format: e.target.value === '' ? null : e.target.value });
  };

  // Filter content (shared between mobile and desktop)
  const filterContent = (
    <>
      <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Filter className="w-4 h-4" />
        {translations.category}
      </h2>

      {/* Category Filter */}
      <div className="relative mb-6">
        <select
          className="input-field text-sm disabled:opacity-50 w-full pe-10"
          value={currentCategory}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={isPending}
        >
          <option value="">{translations.allCategories}</option>
          {categories.length > 0 && 'children' in categories[0] ? (
            (categories as HierarchicalCategory[]).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                {parent.children?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({locale === 'fa' ? toPersianNumber(cat.skillCount) : cat.skillCount})
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            (categories as Category[]).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({locale === 'fa' ? toPersianNumber(cat.skillCount) : cat.skillCount})
              </option>
            ))
          )}
        </select>
        {currentCategory && (
          <button
            onClick={() => handleCategoryChange('')}
            className="absolute end-8 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 rounded"
            type="button"
            title="Clear category"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sort */}
      <h3 className="font-semibold text-text-primary mb-3">
        {translations.sort}
      </h3>
      <select
        className="input-field text-sm mb-6 disabled:opacity-50"
        value={currentSort}
        onChange={handleSortChange}
        disabled={isPending}
      >
        {sortOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>

      {/* Format Filter */}
      {translations.format && (
        <>
          <h3 className="font-semibold text-text-primary mb-3">
            {translations.format}
          </h3>
          <select
            className="input-field text-sm mb-6 disabled:opacity-50"
            value={currentFormat}
            onChange={handleFormatChange}
            disabled={isPending}
          >
            <option value="">{translations.agentSkills || 'Agent Skills (SKILL.md)'}</option>
            <option value="all">{translations.allFormats || 'All Formats'}</option>
            <option value="agents.md">AGENTS.md (Codex)</option>
            <option value="cursorrules">.cursorrules (Cursor)</option>
            <option value="windsurfrules">.windsurfrules (Windsurf)</option>
            <option value="copilot-instructions">Copilot Instructions</option>
          </select>
        </>
      )}

      {/* View Featured Link */}
      {translations.viewFeatured && (
        <Link
          href={`/${locale}/featured`}
          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors mt-4 pt-4 border-t border-border"
        >
          <Star className="w-4 h-4" />
          {translations.viewFeatured}
        </Link>
      )}

      {/* Loading indicator */}
      {isPending && (
        <div className="mt-4 flex items-center gap-2 text-primary-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {translations.searching}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile Filter Toggle */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-text-primary hover:bg-surface-subtle transition-colors w-full justify-center"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>{translations.category}</span>
          {activeFilterCount > 0 && (
            <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
              {locale === 'fa' ? toPersianNumber(activeFilterCount) : activeFilterCount}
            </span>
          )}
        </button>

        {/* Mobile Filter Panel */}
        {isOpen && (
          <div className="mt-4 bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border">
            {filterContent}
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-64 flex-shrink-0">
        <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm sticky top-24">
          {filterContent}
        </div>
      </aside>
    </>
  );
}

// Search Bar Component with Debounce
interface SearchBarProps {
  placeholder: string;
  defaultValue?: string;
}

export function SearchBar({ placeholder, defaultValue = '' }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState(defaultValue);

  // Sync internal state when URL changes externally (e.g., ActiveFilters clearAll)
  useEffect(() => {
    setSearchQuery(defaultValue);
  }, [defaultValue]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    if (searchQuery) {
      params.set('q', searchQuery);
      // Default to sorting by stars when searching
      if (!params.get('sort')) {
        params.set('sort', 'stars');
      }
    } else {
      params.delete('q');
    }
    params.delete('page');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <form onSubmit={handleSearch} className="mb-4">
      <div className="relative">
        <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isPending}
          className="input-field ps-12 pe-24 disabled:opacity-50"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute end-14 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="absolute end-2 top-1/2 -translate-y-1/2 btn-primary py-1.5 px-4 text-sm disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </button>
      </div>
    </form>
  );
}

// Active Filters Display - Shows applied filters as removable chips
interface ActiveFiltersProps {
  query?: string;
  categoryId?: string;
  categoryName?: string;
  sortBy?: string;
  sortName?: string;
  translations: {
    search: string;
    category: string;
    sortBy: string;
    clearAll: string;
  };
}

export function ActiveFilters({
  query,
  categoryId,
  categoryName,
  sortBy,
  sortName,
  translations,
}: ActiveFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasFilters = query || categoryId || (sortBy && sortBy !== 'lastDownloaded');

  if (!hasFilters) return null;

  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {query && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm rounded-full">
          <Search className="w-3 h-3" />
          <span className="max-w-[150px] truncate">&quot;{query}&quot;</span>
          <button
            onClick={() => removeFilter('q')}
            disabled={isPending}
            className="hover:bg-primary-100 dark:hover:bg-primary-800/50 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {categoryId && categoryName && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success text-sm rounded-full">
          <Filter className="w-3 h-3" />
          <span>{categoryName}</span>
          <button
            onClick={() => removeFilter('category')}
            disabled={isPending}
            className="hover:bg-success/20 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {sortBy && sortBy !== 'lastDownloaded' && sortName && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-subtle text-text-secondary text-sm rounded-full">
          <SlidersHorizontal className="w-3 h-3" />
          <span>{sortName}</span>
          <button
            onClick={() => removeFilter('sort')}
            disabled={isPending}
            className="hover:bg-surface-muted rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {(query || categoryId) && (
        <button
          onClick={clearAll}
          disabled={isPending}
          className="text-sm text-text-muted hover:text-error transition-colors"
        >
          {translations.clearAll}
        </button>
      )}

      {isPending && <Loader2 className="w-4 h-4 animate-spin text-primary-500" />}
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  query?: string;
  hasFilters: boolean;
  locale?: string;
  translations: {
    noResults: string;
    noResultsWithQuery: string;
    tryDifferent: string;
    clearFilters: string;
    browseAll: string;
  };
}

export function EmptyState({ query, hasFilters, locale = 'en', translations }: EmptyStateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const clearFilters = () => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface-elevated flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-text-muted" />
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        {query ? translations.noResultsWithQuery.replace('{query}', query) : translations.noResults}
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {translations.tryDifferent}
      </p>
      {hasFilters && (
        <button
          onClick={clearFilters}
          disabled={isPending}
          className="btn-secondary gap-2"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          {translations.clearFilters}
        </button>
      )}
      {!hasFilters && (
        <Link href={`/${locale}/featured`} className="btn-primary gap-2">
          <Star className="w-4 h-4" />
          {translations.browseAll}
        </Link>
      )}
    </div>
  );
}

// Pagination Component
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  locale?: string;
  translations: {
    previous: string;
    next: string;
    page: string;
    of: string;
  };
}

// Helper: Generate page numbers with ellipsis
function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 3) {
    return [1, 2, 3, 4, '...', total];
  }

  if (current >= total - 2) {
    return [1, '...', total - 3, total - 2, total - 1, total];
  }

  return [1, '...', current - 1, current, current + 1, '...', total];
}

export function Pagination({ currentPage, totalPages, locale = 'en', translations }: PaginationProps) {
  // Helper to format numbers based on locale
  const formatPageNumber = (num: number | string) => locale === 'fa' ? toPersianNumber(num) : String(num);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;

    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Don't show pagination if only one page
  if (totalPages <= 1) return null;

  const pages = generatePageNumbers(currentPage, totalPages);

  return (
    <div className="flex flex-col items-center gap-4 mt-8">
      {/* Page indicator */}
      <p className="text-sm text-text-muted">
        {translations.page} {formatPageNumber(currentPage)} {translations.of} {formatPageNumber(totalPages)}
      </p>

      {/* Pagination controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Previous Button */}
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isPending}
          className="flex items-center gap-1 px-2 sm:px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={translations.previous}
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{translations.previous}</span>
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {pages.map((page, index) => (
            page === '...' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 py-2 text-text-muted"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => goToPage(page)}
                disabled={isPending}
                className={`min-w-[40px] px-3 py-2 text-sm border rounded-lg transition-colors disabled:cursor-wait ${
                  page === currentPage
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'border-border hover:bg-surface-subtle'
                }`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {formatPageNumber(page)}
              </button>
            )
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isPending}
          className="flex items-center gap-1 px-2 sm:px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={translations.next}
        >
          <span className="hidden sm:inline">{translations.next}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-primary-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

// Legacy LoadMoreButton for backward compatibility (if needed elsewhere)
interface LoadMoreButtonProps {
  hasMore: boolean;
  currentPage: number;
  label: string;
}

export function LoadMoreButton({ hasMore, currentPage, label }: LoadMoreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleLoadMore = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(currentPage + 1));

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  if (!hasMore) return null;

  return (
    <div className="text-center mt-8">
      <button
        onClick={handleLoadMore}
        disabled={isPending}
        className="btn-secondary gap-2 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          label
        )}
      </button>
    </div>
  );
}
