import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Search, ArrowLeft, ArrowRight, Download, Users, Layers, Sparkles, Terminal, Zap } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroSearch } from '@/components/HeroSearch';
import { SkillCard } from '@/components/SkillCard';
import { createDb, categoryQueries, skillQueries, skills, sql } from '@skillhub/db';
import { formatCompactNumber } from '@/lib/format-number';
import { getPageAlternates } from '@/lib/seo';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

// Get stats directly from database
async function getStats() {
  try {
    const db = createDb();

    // Browse-ready filter: exclude duplicates (matches browseReadyFilter in queries.ts)
    const browseReady = sql`${skills.isDuplicate} = false`;

    // Get total skills count (browse-ready, SKILL.md only)
    const skillsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills)
      .where(sql`${skills.sourceFormat} = 'skill.md' AND ${skills.isBlocked} = false AND ${browseReady}`);
    const totalSkills = skillsResult[0]?.count ?? 0;

    // Get total downloads (ALL skills — downloads are real user actions)
    const downloadsResult = await db
      .select({ sum: sql<number>`coalesce(sum(${skills.downloadCount}), 0)::int` })
      .from(skills);
    const totalDownloads = downloadsResult[0]?.sum ?? 0;

    // Get total categories
    const categories = await categoryQueries.getAll(db);
    const totalCategories = categories.length;

    // Get unique contributors (browse-ready skills only)
    const contributorsResult = await db
      .select({ count: sql<number>`count(distinct ${skills.githubOwner})::int` })
      .from(skills)
      .where(browseReady);
    const totalContributors = contributorsResult[0]?.count ?? 0;

    // Get total indexed skills (all, before curation) for curation note
    const totalIndexedResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills)
      .where(sql`${skills.isBlocked} = false`);
    const totalIndexed = totalIndexedResult[0]?.count ?? 0;

    return {
      totalSkills,
      totalDownloads,
      totalCategories,
      totalContributors,
      totalIndexed,
      platforms: 5,
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    return null;
  }
}

// Get featured skills directly from database
async function getFeaturedSkills() {
  try {
    const db = createDb();
    // Get featured skills, or top skills by popularity if none are featured
    let featuredSkills = await skillQueries.getFeatured(db, 6);
    if (featuredSkills.length === 0) {
      // Fallback to adaptive popularity with owner/repo diversity
      featuredSkills = await skillQueries.getFeaturedWithDiversity(db, 6, 2, 3);
    }
    return featuredSkills;
  } catch (error) {
    console.error('Error fetching featured skills:', error);
    return [];
  }
}



export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/'),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tCommon = await getTranslations('common');
  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  // Fetch real data
  const [statsData, featuredSkills] = await Promise.all([
    getStats(),
    getFeaturedSkills(),
  ]);

  const stats = [
    { value: statsData ? formatCompactNumber(statsData.totalSkills, locale) : '۰', label: t('stats.skills'), icon: Layers },
    { value: statsData ? formatCompactNumber(statsData.totalDownloads, locale) : '۰', label: t('stats.downloads'), icon: Download },
    { value: statsData ? formatCompactNumber(statsData.totalContributors, locale) : '۰', label: t('stats.contributors'), icon: Users },
    { value: statsData ? formatCompactNumber(statsData.totalCategories || 8, locale) : '۸', label: t('stats.categories'), icon: Sparkles },
  ];

  const steps = [
    {
      icon: Search,
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
    },
    {
      icon: Terminal,
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
    },
    {
      icon: Zap,
      title: t('howItWorks.step3.title'),
      description: t('howItWorks.step3.description'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-subtle">
          <div className="container-main py-20 lg:py-32">
            <div className="max-w-3xl mx-auto text-center">
              {/* Tagline */}
              <p className="hero-tagline mb-4 animate-fade-up">
                {t('hero.tagline')}
              </p>

              {/* Title */}
              <h1 className="hero-title mb-6 animate-fade-up animation-delay-100 whitespace-pre-line">
                {t('hero.title')}
              </h1>

              {/* Subtitle */}
              <p className="hero-subtitle mb-8 animate-fade-up animation-delay-200">
                {t('hero.subtitle')}
              </p>

              {/* Search - Client Component */}
              <HeroSearch
                placeholder={t('hero.searchPlaceholder')}
                locale={locale}
              />

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up animation-delay-400">
                <Link href={`/${locale}/browse`} className="btn-primary gap-2">
                  {t('hero.cta')}
                  <ArrowIcon className="w-4 h-4" />
                </Link>
                <Link href={`/${locale}/docs/getting-started`} className="btn-secondary">
                  {t('hero.ctaSecondary')}
                </Link>
              </div>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-1/4 start-1/4 w-96 h-96 bg-primary-200/30 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 end-1/4 w-96 h-96 bg-gold/20 rounded-full blur-3xl" />
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 bg-surface border-y border-border">
          <div className="container-main">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-50 text-primary-600 mb-3">
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div className="text-3xl font-bold text-text-primary ltr-nums mb-1">
                    {stat.value}
                  </div>
                  <div className="text-text-secondary">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-text-muted text-sm mt-6">
              {t('stats.curationNote', { totalIndexed: formatCompactNumber(statsData?.totalIndexed ?? 0, locale) })}
            </p>
          </div>
        </section>

        {/* Featured Skills */}
        <section className="section bg-surface">
          <div className="container-main">
            <div className="text-center mb-12">
              <h2 className="section-title">{t('featured.title')}</h2>
              <p className="section-subtitle">{t('featured.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredSkills.length > 0 ? (
                featuredSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    locale={locale}
                  />
                ))
              ) : (
                // Fallback placeholder cards if no skills
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="card p-6 animate-pulse">
                    <div className="h-6 bg-surface-subtle rounded mb-2 w-1/3"></div>
                    <div className="h-4 bg-surface-subtle rounded mb-4 w-2/3"></div>
                    <div className="flex gap-4">
                      <div className="h-4 bg-surface-subtle rounded w-16"></div>
                      <div className="h-4 bg-surface-subtle rounded w-16"></div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-center mt-8">
              <Link href={`/${locale}/featured`} className="btn-secondary gap-2">
                {tCommon('viewAll')}
                <ArrowIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="section bg-surface-muted">
          <div className="container-main">
            <div className="text-center mb-12">
              <h2 className="section-title">{t('howItWorks.title')}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary text-white mb-6 shadow-primary">
                    <step.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold text-text-primary mb-3">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>

            {/* CLI Example */}
            <div className="max-w-2xl mx-auto mt-12" dir="ltr">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-error" />
                  <div className="w-3 h-3 rounded-full bg-warning" />
                  <div className="w-3 h-3 rounded-full bg-success" />
                </div>
                <code className="block text-sm font-mono text-text-primary text-start">
                  <span className="text-text-muted">$</span> npx skillhub install anthropics/skills/pdf
                </code>
                <code className="block text-sm font-mono text-success mt-2 text-start">
                  ✓ Skill installed to ~/.claude/skills/pdf/
                </code>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
