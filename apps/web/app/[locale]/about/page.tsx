import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Code2, Globe, Shield } from 'lucide-react';
import { getPageAlternates } from '@/lib/seo';



export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/about'),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');

  const features = [
    {
      icon: Code2,
      title: t('features.openSource'),
      description: t('features.openSourceDesc'),
    },
    {
      icon: Globe,
      title: t('features.multiPlatform'),
      description: t('features.multiPlatformDesc'),
    },
    {
      icon: Shield,
      title: t('features.secure'),
      description: t('features.secureDesc'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{t('title')}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="section-title mb-4">{t('mission.title')}</h2>
              <p className="text-lg text-text-secondary">{t('mission.description')}</p>
            </div>

            <h2 className="section-title mb-8">{t('features.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div key={index} className="card p-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary-50 text-primary-600 mb-4">
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-text-secondary">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
