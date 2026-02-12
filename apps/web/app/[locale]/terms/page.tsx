import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FileText, UserCheck, AlertTriangle, Scale, Trash2, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const sectionIcons = {
  service: FileText,
  responsibilities: UserCheck,
  disclaimer: AlertTriangle,
  liability: Scale,
  takedown: Trash2,
  changes: RefreshCw,
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('terms');
  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  const sections = [
    'service',
    'responsibilities',
    'disclaimer',
    'liability',
    'takedown',
    'changes',
  ] as const;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
            <p className="text-sm text-text-muted mt-4">{t('lastUpdated')}</p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main max-w-4xl">
            <div className="space-y-8">
              {sections.map((sectionKey) => {
                const Icon = sectionIcons[sectionKey];
                const showClaimLink = sectionKey === 'takedown';
                return (
                  <div key={sectionKey} className="card p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold text-text-primary mb-2">
                          {t(`sections.${sectionKey}.title`)}
                        </h2>
                        <p className="text-text-secondary" dir={locale === 'fa' ? 'rtl' : 'ltr'}>
                          {t(`sections.${sectionKey}.description`)}
                        </p>
                        {showClaimLink && (
                          <Link
                            href={`/${locale}/claim`}
                            className="inline-flex items-center gap-1 mt-3 text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
                          >
                            {locale === 'fa' ? 'صفحه مدیریت مهارت‌ها' : 'Manage Skills Page'}
                            <ArrowIcon className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
