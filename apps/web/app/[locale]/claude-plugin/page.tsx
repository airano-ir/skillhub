import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPageAlternates } from '@/lib/seo';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Zap,
  Search,
  Shield,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Terminal,
  Clock,
  Star,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { EarlyAccessForm } from '@/components/EarlyAccessForm';
import { createDb, skills, sql } from '@skillhub/db';
import { formatCompactNumber } from '@/lib/format-number';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'claudePlugin' });

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: getPageAlternates(locale, '/claude-plugin'),
    openGraph: {
      title: t('metadata.title'),
      description: t('metadata.description'),
    },
  };
}

async function getStats() {
  try {
    const db = createDb();
    const skillsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills);
    return skillsResult[0]?.count ?? 0;
  } catch {
    return 119000;
  }
}

export default async function ClaudePluginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { locale } = await params;
  const { variant } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('claudePlugin');
  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  const totalSkills = await getStats();

  // A/B Test: variant A (default) = "Get early access", variant B = "Help us prioritize"
  const isVariantB = variant === 'b';

  const benefits = [
    {
      icon: Search,
      title: t('benefits.discovery.title'),
      description: t('benefits.discovery.description'),
    },
    {
      icon: Terminal,
      title: t('benefits.install.title'),
      description: t('benefits.install.description'),
    },
    {
      icon: Zap,
      title: t('benefits.instant.title'),
      description: t('benefits.instant.description'),
    },
    {
      icon: Shield,
      title: t('benefits.secure.title'),
      description: t('benefits.secure.description'),
    },
  ];

  const stats = [
    {
      value: formatCompactNumber(totalSkills, locale),
      label: t('stats.skills'),
      icon: Sparkles,
    },
    {
      value: '5+',
      label: t('stats.platforms'),
      icon: Terminal,
    },
    {
      value: '4.9',
      label: t('stats.rating'),
      icon: Star,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface to-surface-elevated">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          </div>

          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-4xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Clock className="w-4 h-4" />
                {t('hero.badge')}
              </div>

              {/* Title */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-tight">
                {t('hero.title')}
              </h1>

              {/* Subtitle */}
              <p className="text-lg md:text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
                {isVariantB ? t('hero.subtitleB') : t('hero.subtitleA', { count: formatCompactNumber(totalSkills, locale) })}
              </p>

              {/* Stats */}
              <div className="flex flex-wrap justify-center gap-8 mb-12">
                {stats.map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="flex items-center justify-center gap-2 text-3xl font-bold text-text-primary">
                      <stat.icon className="w-6 h-6 text-primary" />
                      {stat.value}
                    </div>
                    <div className="text-sm text-text-secondary">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Email Signup Form */}
              <div className="max-w-md mx-auto">
                <EarlyAccessForm variant={isVariantB ? 'b' : 'a'} locale={locale} />
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 bg-surface-elevated">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
              {t('benefits.title')}
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {benefits.map((benefit, i) => (
                <div
                  key={i}
                  className="p-6 rounded-xl bg-surface border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <benefit.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-text-secondary text-sm">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Preview */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-4">
              {t('howItWorks.title')}
            </h2>
            <p className="text-text-secondary text-center mb-12 max-w-2xl mx-auto">
              {t('howItWorks.subtitle')}
            </p>

            <div className="max-w-4xl mx-auto">
              {/* Code example */}
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm overflow-x-auto">
                <div className="text-gray-400 mb-2"># {t('howItWorks.example.comment')}</div>
                <div className="text-green-400 mb-4">
                  <span className="text-purple-400">User:</span> {t('howItWorks.example.userMessage')}
                </div>
                <div className="text-gray-400 mb-2"># {t('howItWorks.example.claudeComment')}</div>
                <div className="text-blue-400">
                  <span className="text-purple-400">Claude:</span>{' '}
                  <span className="text-yellow-400">search_skills</span>(
                  <span className="text-orange-400">query</span>=
                  <span className="text-green-400">&quot;pdf&quot;</span>)
                </div>
                <div className="text-gray-500 mt-4 border-t border-gray-700 pt-4">
                  {t('howItWorks.example.result')}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-surface-elevated">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
              {t('faq.title')}
            </h2>

            <div className="max-w-3xl mx-auto space-y-6">
              {[1, 2, 3].map((i) => (
                <details
                  key={i}
                  className="group p-6 rounded-xl bg-surface border border-border"
                >
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <h3 className="text-lg font-medium text-text-primary">
                      {t(`faq.q${i}.question`)}
                    </h3>
                    <ArrowIcon className="w-5 h-5 text-text-secondary group-open:rotate-90 transition-transform" />
                  </summary>
                  <p className="mt-4 text-text-secondary">{t(`faq.q${i}.answer`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4">
                {t('cta.title')}
              </h2>
              <p className="text-text-secondary mb-8 max-w-xl mx-auto">
                {t('cta.description', { count: formatCompactNumber(totalSkills, locale) })}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/browse"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                >
                  {t('cta.browseSkills')}
                  <ArrowIcon className="w-4 h-4" />
                </Link>
                <a
                  href="https://github.com/anthropics/skills"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-text-primary font-medium hover:bg-surface-subtle transition-colors"
                >
                  {t('cta.learnMore')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
