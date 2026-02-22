import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import {
  Star, Download, Shield, CheckCircle, Copy,
  ExternalLink, Github, Calendar, User, Tag, ChevronRight, Eye
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FavoriteButton } from '@/components/FavoriteButton';
import { RatingStars } from '@/components/RatingStars';
import { InstallSection } from '@/components/InstallSection';
import { ShareButton } from '@/components/ShareButton';
import { createDb, skillQueries } from '@skillhub/db';
import { FORMAT_LABELS } from 'skillhub-core';
import { formatCompactNumber } from '@/lib/format-number';
import { shouldCountView, getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';
import type { Metadata } from 'next';
import { getPageAlternates } from '@/lib/seo';

// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string[] }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const skillId = id.join('/');

  // Optionally fetch skill name for title
  const dbSkill = await getSkill(skillId);
  const title = dbSkill ? `${dbSkill.name} | SkillHub` : 'SkillHub';
  const description = dbSkill ? dbSkill.description : undefined;

  return {
    title,
    description,
    alternates: getPageAlternates(locale, `/skill/${skillId}`),
  };
}

interface SkillPageProps {
  params: Promise<{ locale: string; id: string[] }>;
}

// Get skill with Redis caching (1 hour TTL)
async function getSkill(skillId: string) {
  try {
    return await getOrSetCache(cacheKeys.skillDetail(skillId), cacheTTL.skill, async () => {
      const db = createDb();
      return await skillQueries.getById(db, skillId);
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    return null;
  }
}

export default async function SkillPage({ params }: SkillPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('skill');
  const tCommon = await getTranslations('common');

  const skillId = id.join('/');
  const isRTL = locale === 'fa';

  // Get skill from database
  const dbSkill = await getSkill(skillId);

  if (!dbSkill) {
    notFound();
  }

  // Check if skill is blocked (removed by owner request)
  if (dbSkill.isBlocked) {
    notFound();
  }

  // Track view count with IP-based rate limiting (1 hour cooldown per IP)
  // Get client IP from headers (works with Cloudflare, nginx, etc.)
  const headersList = await headers();
  const clientIp =
    headersList.get('cf-connecting-ip') ||
    headersList.get('x-real-ip') ||
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';

  // Only increment on primary server (mirror DB is read-only)
  const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
  if (isPrimary) {
    const db = createDb();
    shouldCountView(dbSkill.id, clientIp).then((shouldCount) => {
      if (shouldCount) {
        skillQueries.incrementViews(db, dbSkill.id).catch(() => { });
      }
    }).catch(() => { });
  }

  // Map database response to expected format
  const skill = {
    id: dbSkill.id,
    name: dbSkill.name,
    description: dbSkill.description,
    longDescription: dbSkill.rawContent || dbSkill.description,
    version: dbSkill.version || null,
    license: dbSkill.license || 'MIT',
    author: dbSkill.githubOwner,
    repo: dbSkill.githubRepo,
    repository: `https://github.com/${dbSkill.githubOwner}/${dbSkill.githubRepo}`,
    homepage: dbSkill.homepage || null,
    stars: dbSkill.githubStars || 0,
    downloads: dbSkill.downloadCount || 0,
    views: dbSkill.viewCount || 0,
    securityStatus: dbSkill.securityStatus || 'pass',
    isVerified: dbSkill.isVerified || false,
    createdAt: dbSkill.createdAt,
    updatedAt: dbSkill.updatedAt ? dbSkill.updatedAt.toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US') : 'N/A',
    rating: dbSkill.rating || 0,
    ratingCount: dbSkill.ratingCount || 0,
    sourceFormat: dbSkill.sourceFormat || 'skill.md',
  };

  // Content section title based on source format (uses FORMAT_LABELS from skillhub-core)
  const getContentTitle = (format: string) => {
    const label = FORMAT_LABELS[format as keyof typeof FORMAT_LABELS] || FORMAT_LABELS['skill.md'];
    if (format === 'copilot-instructions') {
      return isRTL ? 'دستورالعمل Copilot' : label;
    }
    return isRTL ? `محتوای ${label}` : `${label} Content`;
  };

  // Source format badge configuration (for non-SKILL.md formats)
  const FORMAT_PLATFORMS: Record<string, string> = {
    'agents.md': 'Codex',
    'cursorrules': 'Cursor',
    'windsurfrules': 'Windsurf',
    'copilot-instructions': 'Copilot',
  };

  const getSourceFormatBadge = (format: string) => {
    const platform = FORMAT_PLATFORMS[format];
    if (!platform) return null;
    const label = FORMAT_LABELS[format as keyof typeof FORMAT_LABELS] || format;
    return { label, platform };
  };

  const sourceFormatBadge = getSourceFormatBadge(skill.sourceFormat);

  const getSecurityConfig = (status: string) => {
    switch (status) {
      case 'pass': return {
        label: t('security.pass'),
        icon: '✓',
        bg: 'bg-success/10',
        text: 'text-success',
        border: 'border-success/20'
      };
      case 'warning': return {
        label: t('security.warning'),
        icon: '⚠',
        bg: 'bg-warning/10',
        text: 'text-warning',
        border: 'border-warning/20'
      };
      case 'fail': return {
        label: t('security.fail'),
        icon: '✕',
        bg: 'bg-error/10',
        text: 'text-error',
        border: 'border-error/20'
      };
      default: return {
        label: t('security.pass'),
        icon: '✓',
        bg: 'bg-success/10',
        text: 'text-success',
        border: 'border-success/20'
      };
    }
  };

  const securityConfig = getSecurityConfig(skill.securityStatus);

  const installCommands = {
    claude: {
      cli: `npx skillhub install ${skillId}`,
      path: `~/.claude/skills/${skill.name}/`,
    },
    codex: {
      cli: `npx skillhub install ${skillId} --platform codex`,
      path: `~/.codex/skills/${skill.name}/`,
    },
    copilot: {
      cli: `npx skillhub install ${skillId} --platform copilot`,
      path: `.github/instructions/${skill.name}.instructions.md`,
    },
    cursor: {
      cli: `npx skillhub install ${skillId} --platform cursor`,
      path: `.cursor/rules/${skill.name}.mdc`,
    },
    windsurf: {
      cli: `npx skillhub install ${skillId} --platform windsurf`,
      path: `.windsurf/rules/${skill.name}.md`,
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <div className="bg-gradient-subtle border-b border-border">
          <div className="container-main py-6 lg:py-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-text-muted mb-6">
              <Link href={`/${locale}/browse`} className="hover:text-primary-600 transition-colors">
                {isRTL ? 'مرور' : 'Browse'}
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-text-primary font-medium">{skill.name}</span>
            </nav>

            {/* Main Header */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              {/* Left: Title & Description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h1 className="text-3xl lg:text-4xl font-bold text-text-primary">
                    {skill.name}
                  </h1>
                  {skill.isVerified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-success/10 text-success text-sm font-medium rounded-full border border-success/20">
                      <CheckCircle className="w-4 h-4" />
                      {tCommon('verified')}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 ${securityConfig.bg} ${securityConfig.text} text-sm font-medium rounded-full border ${securityConfig.border}`}>
                    <Shield className="w-4 h-4" />
                    {securityConfig.label}
                  </span>
                  {sourceFormatBadge && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 text-primary-700 text-sm font-medium rounded-full border border-primary-200 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-800">
                      {sourceFormatBadge.platform}
                    </span>
                  )}
                </div>

                <p className="text-lg text-text-secondary mb-4 max-w-2xl" dir="auto">
                  {skill.description}
                </p>

                {/* Author, Version, License & Last Update */}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <a
                    href={`https://github.com/${skill.author}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-text-secondary hover:text-primary-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-surface-subtle flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-medium">@{skill.author}</span>
                  </a>
                  {skill.version && (
                    <>
                      <span className="text-text-muted">•</span>
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <Tag className="w-4 h-4" />
                        <span className="ltr-nums">v{skill.version}</span>
                      </span>
                    </>
                  )}
                  <span className="text-text-muted">•</span>
                  <span className="text-text-muted bg-surface-subtle px-2 py-0.5 rounded">
                    {skill.license}
                  </span>
                  <span className="text-text-muted">•</span>
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <Calendar className="w-4 h-4" />
                    <span className="ltr-nums">{skill.updatedAt}</span>
                  </span>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-3">
                <FavoriteButton skillId={skill.id} size="lg" showLabel={true} />
                <ShareButton
                  title={skill.name}
                  path={`/${locale}/skill/${skill.id}`}
                  translations={{
                    share: t('share.button'),
                    copied: t('share.copied'),
                    copyLink: t('share.copyLink'),
                  }}
                />
                <a
                  href={skill.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-surface-elevated hover:bg-surface-subtle border border-border text-text-secondary hover:text-text-primary transition-colors"
                  title="GitHub"
                >
                  <Github className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Project Configuration Warning Banner (non-SKILL.md) */}
        {sourceFormatBadge && (
          <div className="bg-warning/10 border-b border-warning/20">
            <div className="container-main py-3">
              <div className="flex items-start gap-3 text-sm">
                <span className="text-warning text-lg flex-shrink-0">⚠</span>
                <div>
                  <p className="text-warning-foreground dark:text-warning" dir="auto">
                    {isRTL
                      ? `این یک فایل پیکربندی اختصاصی پروژه (${sourceFormatBadge.label}) است، نه یک مهارت عامل قابل استفاده مجدد. حاوی دستورالعمل‌هایی است که برای مخزن ${skill.repo} طراحی شده و ممکن است در پروژه‌های دیگر کاربردی نباشد.`
                      : `This is a project-specific configuration file (${sourceFormatBadge.label}), not a reusable Agent Skill. It contains instructions designed for the ${skill.repo} repository and may not be applicable to other projects.`}
                  </p>
                  <Link
                    href={`/${locale}/browse`}
                    className="inline-flex items-center gap-1 mt-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {isRTL ? 'مرور مهارت‌های قابل استفاده مجدد' : 'Browse reusable skills'}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="bg-surface-elevated border-b border-border">
          <div className="container-main">
            <div className="flex items-center gap-6 lg:gap-10 py-4 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-fit">
                <RatingStars
                  skillId={skill.id}
                  averageRating={skill.rating}
                  ratingCount={skill.ratingCount}
                  size="sm"
                />
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2 min-w-fit">
                <Star className="w-5 h-5 text-gold" />
                <span className="font-semibold text-text-primary ltr-nums">
                  {formatCompactNumber(skill.stars, locale)}
                </span>
                <span className="text-text-muted text-sm">{tCommon('stars')}</span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2 min-w-fit">
                <Download className="w-5 h-5 text-primary-500" />
                <span className="font-semibold text-text-primary ltr-nums">
                  {formatCompactNumber(skill.downloads, locale)}
                </span>
                <span className="text-text-muted text-sm">{tCommon('downloads')}</span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2 min-w-fit">
                <Eye className="w-5 h-5 text-text-muted" />
                <span className="font-semibold text-text-primary ltr-nums">
                  {formatCompactNumber(skill.views, locale)}
                </span>
                <span className="text-text-muted text-sm">{tCommon('views')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container-main py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: README Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Install (Mobile) */}
              <div className="lg:hidden">
                <InstallSection
                  skillId={skill.id}
                  skillName={skill.name}
                  repositoryUrl={skill.repository}
                  sourceFormat={skill.sourceFormat}
                  installCommands={installCommands}
                  translations={{
                    title: t('install.title'),
                    cli: t('install.cli'),
                    cliGlobal: t('install.cliGlobal') || 'Install globally (user-level):',
                    cliProject: t('install.cliProject') || 'Install in current project:',
                    selectFolder: t('install.selectFolder'),
                    suggestedPath: t('install.suggestedPath'),
                    copied: t('install.copied'),
                    downloadZip: t('install.downloadZip') || 'Download ZIP',
                    copyCommand: t('install.copyCommand') || 'Copy command',
                    downloading: t('install.downloading') || 'Downloading...',
                    installing: t('install.installing') || 'Installing...',
                    installed: t('install.installed') || 'Installed!',
                    downloadFailed: t('install.downloadFailed') || 'Download failed',
                    browserNotSupported: t('install.browserNotSupported') || 'Browser not supported',
                    rateLimitError: t('install.rateLimitError') || 'Rate limit exceeded',
                    timeoutError: t('install.timeoutError') || 'Request timed out',
                    notFoundError: t('install.notFoundError') || 'Skill not found',
                    noFilesError: t('install.noFilesError') || 'No files found',
                    disclaimer: t('install.disclaimer'),
                    folderNotePrefix: t('install.folderNotePrefix') || 'A folder named "',
                    folderNoteSuffix: t('install.folderNoteSuffix') || '" will be created',
                  }}
                />
              </div>

              {/* README Section */}
              <div className="bg-surface-elevated rounded-2xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-surface-subtle/50">
                  <h2 className="font-semibold text-text-primary flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    {getContentTitle(skill.sourceFormat)}
                  </h2>
                </div>
                <div className="p-6">
                  <div className="prose prose-slate dark:prose-invert max-w-none" dir="auto">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-surface-subtle rounded-xl p-4 overflow-x-auto text-start border border-border">
                      <code>{skill.longDescription}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Source Links (Mobile) */}
              <div className="lg:hidden bg-surface-elevated rounded-2xl border border-border p-6">
                <h3 className="font-semibold text-text-primary mb-4">
                  {isRTL ? 'لینک‌ها' : 'Links'}
                </h3>
                <div className="space-y-3">
                  <a
                    href={skill.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-surface-subtle hover:bg-surface-muted transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Github className="w-5 h-5 text-text-muted" />
                      <div>
                        <div className="font-medium text-text-primary">{t('meta.repository')}</div>
                        <div className="text-sm text-text-muted">{skill.author}/{skill.repo}</div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-primary-600 transition-colors" />
                  </a>
                  {skill.homepage && (
                    <a
                      href={skill.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-subtle hover:bg-surface-muted transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <ExternalLink className="w-5 h-5 text-text-muted" />
                        <div>
                          <div className="font-medium text-text-primary">{t('meta.homepage')}</div>
                          <div className="text-sm text-text-muted truncate max-w-[200px]">{skill.homepage}</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-primary-600 transition-colors" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Sidebar (Desktop) */}
            <div className="hidden lg:block space-y-6">
              <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto space-y-6 scrollbar-thin">
                {/* Install Section */}
                <InstallSection
                  skillId={skill.id}
                  skillName={skill.name}
                  repositoryUrl={skill.repository}
                  sourceFormat={skill.sourceFormat}
                  installCommands={installCommands}
                  translations={{
                    title: t('install.title'),
                    cli: t('install.cli'),
                    cliGlobal: t('install.cliGlobal') || 'Install globally (user-level):',
                    cliProject: t('install.cliProject') || 'Install in current project:',
                    selectFolder: t('install.selectFolder'),
                    suggestedPath: t('install.suggestedPath'),
                    copied: t('install.copied'),
                    downloadZip: t('install.downloadZip') || 'Download ZIP',
                    copyCommand: t('install.copyCommand') || 'Copy command',
                    downloading: t('install.downloading') || 'Downloading...',
                    installing: t('install.installing') || 'Installing...',
                    installed: t('install.installed') || 'Installed!',
                    downloadFailed: t('install.downloadFailed') || 'Download failed',
                    browserNotSupported: t('install.browserNotSupported') || 'Browser not supported',
                    rateLimitError: t('install.rateLimitError') || 'Rate limit exceeded',
                    timeoutError: t('install.timeoutError') || 'Request timed out',
                    notFoundError: t('install.notFoundError') || 'Skill not found',
                    noFilesError: t('install.noFilesError') || 'No files found',
                    disclaimer: t('install.disclaimer'),
                    folderNotePrefix: t('install.folderNotePrefix') || 'A folder named "',
                    folderNoteSuffix: t('install.folderNoteSuffix') || '" will be created',
                  }}
                />

                {/* Links Card (Desktop) */}
                {skill.homepage && (
                  <div className="bg-surface-elevated rounded-2xl border border-border p-6">
                    <h3 className="font-semibold text-text-primary mb-4">
                      {isRTL ? 'لینک‌ها' : 'Links'}
                    </h3>
                    <a
                      href={skill.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary-600 transition-colors py-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="flex-1">{t('meta.homepage')}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
