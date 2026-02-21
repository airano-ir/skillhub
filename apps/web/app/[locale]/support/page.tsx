import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Mail, Bitcoin, ExternalLink } from 'lucide-react';
import { getPageAlternates } from '@/lib/seo';


export const dynamic = 'force-dynamic';

interface SupportPageProps {
  params: Promise<{ locale: string }>;
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/support'),
  };
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('support');
  const isRTL = locale === 'fa';

  const supportOptions = [
    {
      icon: Mail,
      title: t('email'),
      description: t('emailDesc'),
      href: 'mailto:hi.airano@gmail.com',
      cta: t('sendEmail'),
      color: 'bg-surface-subtle text-text-secondary',
    },
    {
      icon: Bitcoin,
      title: t('donate'),
      description: t('donateDesc'),
      href: 'https://nowpayments.io/donation/airano',
      cta: t('donateNow'),
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>
        </section>

        {/* Support Options */}
        <section className="section bg-surface">
          <div className="container-main">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              {supportOptions.map((option, index) => (
                <a
                  key={index}
                  href={option.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card p-6 text-center hover:border-primary-500 border border-border transition-all group"
                >
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${option.color} mb-4`}>
                    <option.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">
                    {option.title}
                  </h3>
                  <p className="text-text-secondary mb-4" dir={isRTL ? 'rtl' : 'ltr'}>
                    {option.description}
                  </p>
                  <span className="inline-flex items-center gap-2 btn-primary text-sm py-2 px-4 group-hover:scale-105 transition-transform">
                    {option.cta}
                    <ExternalLink className="w-4 h-4" />
                  </span>
                </a>
              ))}
            </div>

            {/* Why Crypto Only */}
            <div className="mt-16 max-w-2xl mx-auto">
              <div className="card p-6 bg-surface-subtle border border-border">
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  {t('whyCryptoTitle')}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed" dir={isRTL ? 'rtl' : 'ltr'}>
                  {t('whyCryptoDesc')}
                </p>
              </div>
            </div>

            {/* Crypto Info */}
            <div className="mt-8 text-center">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                {t('popularCoins')}
              </h3>
              <div className="flex flex-wrap justify-center gap-3">
                {['Bitcoin', 'Ethereum', 'TON', 'Tron', 'Solana', 'Litecoin', 'Dogecoin'].map((crypto) => (
                  <span
                    key={crypto}
                    className="px-3 py-1.5 bg-surface-subtle text-text-secondary text-sm rounded-full"
                  >
                    {crypto}
                  </span>
                ))}
              </div>
              <p className="text-text-muted text-sm mt-4">
                {t('andMoreCrypto')}
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
