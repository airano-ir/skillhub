import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Github, Heart, Users, Code, GitFork, ExternalLink, Database, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface AttributionStats {
  totalSkills: number;
  totalContributors: number;
  totalRepos: number;
  awesomeLists: {
    count: number;
    totalRepos: number;
  };
  forkNetworks: number;
  licenseDistribution: Array<{
    license: string;
    count: number;
    percentage: number;
  }>;
  discoveryBySource: Array<{
    source: string;
    count: number;
    withSkills: number;
  }>;
  lastUpdated: string;
}

async function getAttributionStats(): Promise<AttributionStats | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/attribution`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatLicenseName(license: string, locale: string): string {
  const licenseNames: Record<string, { en: string; fa: string }> = {
    'Unspecified': { en: 'Not Specified', fa: 'مشخص نشده' },
    'NOASSERTION': { en: 'Not Declared', fa: 'اعلام نشده' },
    'Complete terms in LICENSE.txt': { en: 'Custom License', fa: 'لایسنس سفارشی' },
    'Proprietary. LICENSE.txt has complete terms': { en: 'Proprietary', fa: 'اختصاصی' },
    'MIT license': { en: 'MIT', fa: 'MIT' },
    'BSD-3-Clause license': { en: 'BSD-3-Clause', fa: 'BSD-3-Clause' },
    'Unknown': { en: 'Unknown', fa: 'نامشخص' },
  };
  const names = licenseNames[license];
  return names ? names[locale as 'en' | 'fa'] || names.en : license;
}

export default async function AttributionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('attribution');
  const stats = await getAttributionStats();

  // Fallback data if API fails
  const sources = [
    {
      name: locale === 'fa' ? 'مهارت‌های ایندکس شده' : 'Indexed Skills',
      icon: Database,
      description: locale === 'fa'
        ? 'مهارت‌های ایندکس شده در تمام پلتفرم‌ها'
        : 'Skills indexed across all supported platforms',
      count: stats ? formatNumber(stats.totalSkills) : '170K+',
    },
    {
      name: locale === 'fa' ? 'مخازن کشف شده' : 'Repositories Discovered',
      icon: Github,
      description: locale === 'fa'
        ? 'مخازن عمومی GitHub اسکن شده برای مهارت‌ها'
        : 'Public GitHub repositories scanned for skills',
      count: stats ? formatNumber(stats.totalRepos) : '50K+',
    },
    {
      name: locale === 'fa' ? 'شبکه Fork‌ها' : 'Fork Networks',
      icon: GitFork,
      description: locale === 'fa'
        ? 'شبکه Fork‌های مخازن معروف مهارت'
        : 'Fork networks of popular skill repositories',
      count: stats ? formatNumber(stats.forkNetworks) : '500+',
    },
    {
      name: locale === 'fa' ? 'مشارکت‌کنندگان' : 'Contributors',
      icon: Users,
      description: locale === 'fa'
        ? 'توسعه‌دهندگانی که مهارت‌ها را ایجاد و نگهداری می‌کنند'
        : 'Developers who create and maintain skills',
      count: stats ? formatNumber(stats.totalContributors) : '6K+',
    },
  ];

  // Use real license data if available, otherwise fallback
  const licenses = stats?.licenseDistribution.slice(0, 5).map((l) => ({
    name: formatLicenseName(l.license, locale),
    percentage: l.percentage,
    count: l.count,
  })) || [
    { name: 'MIT', percentage: 65, count: 0 },
    { name: 'Apache 2.0', percentage: 20, count: 0 },
    { name: 'BSD', percentage: 8, count: 0 },
    { name: 'GPL', percentage: 5, count: 0 },
    { name: locale === 'fa' ? 'سایر' : 'Other', percentage: 2, count: 0 },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
            {stats && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-text-muted">
                <Clock className="w-4 h-4" />
                <span>
                  {locale === 'fa' ? 'آخرین به‌روزرسانی: ' : 'Last updated: '}
                  {new Date(stats.lastUpdated).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Main Content */}
        <section className="section bg-surface">
          <div className="container-main max-w-4xl">
            {/* Sources Section */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('sources.title')}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {sources.map((source) => {
                  const Icon = source.icon;
                  return (
                    <div key={source.name} className="card p-5 hover:border-primary-300 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-semibold text-text-primary">{source.name}</h3>
                            <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                              {source.count}
                            </span>
                          </div>
                          <p className="text-sm text-text-secondary">{source.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* License Compliance Section */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('licenses.title')}
              </h2>
              <div className="card p-6">
                <p className="text-text-secondary mb-6">{t('licenses.description')}</p>
                <div className="space-y-3">
                  {licenses.map((license) => (
                    <div key={license.name} className="flex items-center gap-4">
                      <span className="w-24 text-sm font-medium text-text-primary">{license.name}</span>
                      <div className="flex-1 h-2 bg-surface-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${license.percentage}%` }}
                        />
                      </div>
                      <span className="w-16 text-sm text-text-muted text-right">
                        {license.percentage}%
                        {stats && license.count > 0 && (
                          <span className="block text-xs">({formatNumber(license.count)})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* How It Works Section */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('howItWorks.title')}
              </h2>
              <div className="card p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-600">1</div>
                    <p className="text-text-secondary">{t('howItWorks.step1')}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-600">2</div>
                    <p className="text-text-secondary">{t('howItWorks.step2')}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-600">3</div>
                    <p className="text-text-secondary">{t('howItWorks.step3')}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-600">4</div>
                    <p className="text-text-secondary">{t('howItWorks.step4')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Special Thanks Section */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('thanks.title')}
              </h2>
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Heart className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-text-primary">{t('thanks.subtitle')}</span>
                </div>
                <ul className="space-y-2 text-text-secondary">
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    <Link href="https://anthropic.com" target="_blank" className="hover:text-primary-600 transition-colors">
                      Anthropic
                    </Link>
                    <span className="text-text-muted">- {locale === 'fa' ? 'استاندارد SKILL.md و Agent Skills' : 'SKILL.md and Agent Skills standard'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Github className="w-4 h-4" />
                    <Link href="https://github.com/anthropics/skills" target="_blank" className="hover:text-primary-600 transition-colors">
                      anthropics/skills
                    </Link>
                    <span className="text-text-muted">- {locale === 'fa' ? 'مخزن رسمی مهارت‌ها' : 'Official skills repository'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    <span>
                      {locale === 'fa'
                        ? 'OpenAI، GitHub، Cursor و Windsurf'
                        : 'OpenAI, GitHub, Cursor & Windsurf'}
                    </span>
                    <span className="text-text-muted">- {locale === 'fa' ? 'پلتفرم‌های پشتیبانی شده' : 'Supported platforms'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>
                      {locale === 'fa'
                        ? `همه ${stats ? formatNumber(stats.totalContributors) : ''} مشارکت‌کنندگان متن‌باز`
                        : `All ${stats ? formatNumber(stats.totalContributors) : ''} open-source contributors`}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Your Rights Section */}
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('rights.title')}
              </h2>
              <div className="card p-6 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                <p className="text-text-secondary mb-4">{t('rights.description')}</p>
                <Link
                  href={`/${locale}/claim`}
                  className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium transition-colors"
                >
                  {t('rights.claimLink')}
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
