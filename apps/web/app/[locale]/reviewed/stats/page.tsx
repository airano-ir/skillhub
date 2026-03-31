import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { createDb, skillReviewQueries } from '@skillhub/db';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';
import { BarChart3, ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface StatsData {
  pipeline: Record<string, number>;
  totalReviews: number;
  scoreDistribution: Record<string, number>;
  securityStats: Record<string, number>;
  malwareCount: number;
}

async function getPublicReviewStats(): Promise<StatsData | null> {
  try {
    return await getOrSetCache(cacheKeys.reviewStatsPublic(), cacheTTL.reviewStatsPublic, async () => {
      const db = createDb();
      const [pipeline, totalReviews, scoreDistribution, securityStats, malwareCount] = await Promise.all([
        skillReviewQueries.getPublicPipelineStats(db),
        skillReviewQueries.countTotalReviews(db),
        skillReviewQueries.getScoreDistribution(db),
        skillReviewQueries.getSecurityStats(db),
        skillReviewQueries.countMaliciousSkills(db),
      ]);
      return { pipeline, totalReviews, scoreDistribution, securityStats, malwareCount };
    });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/reviewed/stats'),
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  href?: string;
}) {
  const content = (
    <div className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-surface ${href ? 'hover:border-primary-300 transition-colors' : ''}`}>
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary ltr-nums">{value.toLocaleString()}</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function BarRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="font-medium text-text-primary ltr-nums">
          {value.toLocaleString()} <span className="text-text-muted">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-3 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}

export default async function ReviewStatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('reviewStats');

  const data = await getPublicReviewStats();

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Failed to load stats.</p>
        </main>
        <Footer />
      </div>
    );
  }

  // Total = all browse-ready SKILL.md skills (for meaningful percentages)
  const pipelineTotal = Object.values(data.pipeline).reduce((sum, n) => sum + n, 0);

  const scoreTotal =
    data.scoreDistribution.high +
    data.scoreDistribution.mid +
    data.scoreDistribution.low;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Header Section */}
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 mb-4">
              <BarChart3 className="w-7 h-7" />
            </div>
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main max-w-4xl">
            {/* Review Pipeline */}
            <div className="card p-6 mb-8">
              <h2 className="text-xl font-semibold text-text-primary mb-1">{t('pipelineTitle')}</h2>
              <p className="text-sm text-text-muted mb-6">{t('pipelineDescription')}</p>
              <div className="space-y-4">
                <BarRow label={t('aiReviewed')} value={data.pipeline['ai-reviewed'] ?? 0} total={pipelineTotal} color="bg-primary-500" />
                <BarRow label={t('needsReReview')} value={data.pipeline['needs-re-review'] ?? 0} total={pipelineTotal} color="bg-warning" />
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t('totalReviews')}</span>
                <span className="font-semibold text-text-primary ltr-nums">{data.totalReviews.toLocaleString()}</span>
              </div>
            </div>

            {/* Score Distribution */}
            <div className="card p-6 mb-8">
              <h2 className="text-xl font-semibold text-text-primary mb-1">{t('scoreTitle')}</h2>
              <p className="text-sm text-text-muted mb-6">{t('scoreDescription')}</p>
              <div className="space-y-4">
                <BarRow label={t('scoreHigh')} value={data.scoreDistribution.high} total={scoreTotal} color="bg-success" />
                <BarRow label={t('scoreMid')} value={data.scoreDistribution.mid} total={scoreTotal} color="bg-gold" />
                <BarRow label={t('scoreLow')} value={data.scoreDistribution.low} total={scoreTotal} color="bg-error" />
              </div>
            </div>

            {/* Security & Malware */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Security Scan */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-text-primary mb-1">{t('securityTitle')}</h2>
                <p className="text-sm text-text-muted mb-6">{t('securityDescription')}</p>
                <div className="space-y-3">
                  <StatCard icon={CheckCircle} label={t('securityPass')} value={data.securityStats.pass} color="bg-success/10 text-success" />
                  <StatCard icon={AlertTriangle} label={t('securityWarning')} value={data.securityStats.warning} color="bg-warning/10 text-warning" />
                  <StatCard icon={ShieldAlert} label={t('securityFail')} value={data.securityStats.fail} color="bg-error/10 text-error" />
                </div>
              </div>

              {/* Malware Detection */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-text-primary mb-1">{t('malwareTitle')}</h2>
                <p className="text-sm text-text-muted mb-6">{t('malwareDescription')}</p>
                <StatCard
                  icon={ShieldAlert}
                  label={t('malwareFlagged')}
                  value={data.malwareCount}
                  color="bg-error/10 text-error"
                  href={`/${locale}/malware`}
                />
                {data.malwareCount > 0 && (
                  <Link
                    href={`/${locale}/malware`}
                    className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {t('malwareViewAll')} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
