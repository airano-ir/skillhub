import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SkillCard } from '@/components/SkillCard';
import { Pagination } from '@/components/BrowseFilters';
import { createDb, skillQueries } from '@skillhub/db';
import { formatCompactNumber, toPersianNumber } from '@/lib/format-number';
import { ExternalLink, Download, Package, Eye, GitFork, ArrowUpDown, FolderGit2 } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}): Promise<Metadata> {
  const { locale, username } = await params;
  return {
    title: `${decodeURIComponent(username)} | SkillHub`,
    alternates: getPageAlternates(locale, `/owner/${username}`),
  };
}

const ITEMS_PER_PAGE = 24;

type SortOption = 'popularity' | 'downloads' | 'stars';

interface OwnerPageProps {
  params: Promise<{ locale: string; username: string }>;
  searchParams: Promise<{ page?: string; sort?: string; repo?: string }>;
}

export default async function OwnerPage({ params, searchParams }: OwnerPageProps) {
  const { locale, username: rawUsername } = await params;
  const searchParamsResolved = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('owner');
  const tBrowse = await getTranslations('browse');
  const username = decodeURIComponent(rawUsername);
  const page = Math.max(1, parseInt(searchParamsResolved.page || '1'));
  const sort = (['popularity', 'downloads', 'stars'].includes(searchParamsResolved.sort || '')
    ? searchParamsResolved.sort
    : 'popularity') as SortOption;
  const activeRepo = searchParamsResolved.repo || '';

  const db = createDb();

  // Fetch stats and repo list with caching (30 min TTL), count is dynamic per filter
  const [stats, totalSkills, ownerRepos] = await Promise.all([
    getOrSetCache(cacheKeys.ownerStats(username), cacheTTL.owner, () =>
      skillQueries.getOwnerStats(db, username)
    ),
    skillQueries.countByOwner(db, username, activeRepo || undefined),
    getOrSetCache(cacheKeys.ownerRepos(username), cacheTTL.owner, () =>
      skillQueries.getOwnerRepos(db, username)
    ),
  ]);

  if (stats.totalSkills === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">{t('notFound')}</h1>
          <p className="text-text-secondary mb-8">
            {t('notFoundDescription', { username })}
          </p>
          <Link href={`/${locale}/browse`} className="text-primary hover:underline">
            {t('browseAll')}
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const offset = (page - 1) * ITEMS_PER_PAGE;
  const totalPages = Math.ceil(totalSkills / ITEMS_PER_PAGE);

  const skills = await skillQueries.getByOwner(db, username, {
    limit: ITEMS_PER_PAGE,
    offset,
    sortBy: sort,
    repo: activeRepo || undefined,
  });

  // Group fetched skills by repo for display
  const repoMap = new Map<string, {
    name: string;
    stars: number;
    skills: typeof skills;
  }>();

  for (const skill of skills) {
    const repo = skill.githubRepo;
    if (!repoMap.has(repo)) {
      repoMap.set(repo, {
        name: repo,
        stars: skill.githubStars ?? 0,
        skills: [],
      });
    }
    repoMap.get(repo)!.skills.push(skill);
  }

  const repos = Array.from(repoMap.values());

  const formatNum = (n: number) =>
    locale === 'fa' ? toPersianNumber(formatCompactNumber(n, locale)) : formatCompactNumber(n, locale);

  const startItem = offset + 1;
  const endItem = Math.min(offset + ITEMS_PER_PAGE, totalSkills);

  const paginationTranslations = {
    previous: tBrowse('pagination.previous'),
    next: tBrowse('pagination.next'),
    page: tBrowse('pagination.page'),
    of: tBrowse('pagination.of'),
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'popularity', label: t('sort.popularity') },
    { value: 'downloads', label: t('sort.downloads') },
    { value: 'stars', label: t('sort.stars') },
  ];

  // Build URL helper preserving sort/repo params
  const buildUrl = (overrides: { sort?: string; repo?: string; page?: number }) => {
    const params = new URLSearchParams();
    const s = overrides.sort ?? sort;
    const r = overrides.repo ?? activeRepo;
    const p = overrides.page ?? 1;
    if (s && s !== 'popularity') params.set('sort', s);
    if (r) params.set('repo', r);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/${locale}/owner/${rawUsername}${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Owner Header */}
        <section className="bg-gradient-subtle border-b border-border">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <img
                src={`https://github.com/${username}.png?size=96`}
                alt={username}
                width={96}
                height={96}
                className="rounded-full border-2 border-border shadow-sm"
              />
              <div className="text-center sm:text-start flex-1">
                <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center sm:justify-start gap-2 text-text-primary">
                  {t('title', { username })}
                  <a
                    href={`https://github.com/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </h1>

                {/* Stats */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-primary" />
                    {t('stats.skills', { count: stats.totalSkills })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-primary" />
                    {formatNum(stats.totalDownloads)} {t('stats.downloads')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-primary" />
                    {formatNum(stats.totalViews)} {t('stats.views')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GitFork className="w-4 h-4 text-primary" />
                    {t('stats.repos', { count: stats.totalRepos })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-6">
          {/* Repo filter chips (only if > 1 repo) */}
          {ownerRepos.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <FolderGit2 className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-secondary">{t('repo.filter')}:</span>
              <Link
                href={buildUrl({ repo: '', page: 1 })}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${!activeRepo
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-surface-elevated text-text-secondary hover:bg-surface-subtle border border-border'
                  }`}
              >
                {t('repo.all')} ({locale === 'fa' ? toPersianNumber(stats.totalSkills) : stats.totalSkills})
              </Link>
              {ownerRepos.map((r) => (
                <Link
                  key={r.repo}
                  href={buildUrl({ repo: r.repo, page: 1 })}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${activeRepo === r.repo
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'bg-surface-elevated text-text-secondary hover:bg-surface-subtle border border-border'
                    }`}
                >
                  {r.repo} ({locale === 'fa' ? toPersianNumber(r.skillCount) : r.skillCount})
                </Link>
              ))}
            </div>
          )}

          {/* Controls: Sort + Results count */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            {/* Results count */}
            <p className="text-sm text-text-secondary">
              {t('pagination.showing', {
                start: locale === 'fa' ? toPersianNumber(startItem) : startItem,
                end: locale === 'fa' ? toPersianNumber(endItem) : endItem,
                total: locale === 'fa' ? toPersianNumber(totalSkills) : totalSkills,
              })}
            </p>

            {/* Sort selector */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-secondary">{t('sort.label')}:</span>
              <div className="flex gap-1">
                {sortOptions.map((opt) => (
                  <Link
                    key={opt.value}
                    href={buildUrl({ sort: opt.value, page: 1 })}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${sort === opt.value
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-surface-elevated text-text-secondary hover:bg-surface-subtle border border-border'
                      }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Claim CTA - subtle inline hint */}
          <div className="flex items-center gap-2 mb-6 text-xs text-text-muted">
            <span>{t('claimCta')}</span>
            <Link
              href={`/${locale}/claim`}
              className="text-primary hover:underline font-medium whitespace-nowrap"
            >
              {t('claimButton')}
            </Link>
          </div>

          {/* Repos + Skills */}
          {repos.map((repo) => (
            <section key={repo.name} className="mb-8">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <h2 className="text-lg font-semibold text-text-primary">{repo.name}</h2>
                <span className="text-xs text-text-muted flex items-center gap-1 bg-surface-elevated px-2 py-0.5 rounded-full">
                  {t('repo.skills', { count: repo.skills.length })}
                </span>
                <a
                  href={`https://github.com/${username}/${repo.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-text-muted hover:text-primary flex items-center gap-1 ms-auto transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> {t('repo.viewOnGithub')}
                </a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {repo.skills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            locale={locale}
            translations={paginationTranslations}
          />

          {/* Browse CTA - link to owner page and CLI for owners with long enough usernames */}
          <div className="bg-surface-elevated border border-border rounded-xl p-6 mt-8 text-center">
            <p className="text-sm text-text-secondary mb-3">
              {t('installCta')}
            </p>
            {skills.length > 0 && (
              <code className="bg-surface border border-border px-4 py-2 rounded-lg text-sm font-mono text-text-primary" dir="ltr">
                npx skillhub install {skills[0].id}
              </code>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
