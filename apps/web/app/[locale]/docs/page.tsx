import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BookOpen, Terminal, Code } from 'lucide-react';
import Link from 'next/link';
import { getPageAlternates } from '@/lib/seo';



export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/docs'),
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  const docs = [
    {
      icon: BookOpen,
      title: t('gettingStarted.title'),
      description: t('gettingStarted.description'),
      href: `/${locale}/docs/getting-started`,
    },
    {
      icon: Terminal,
      title: t('cli.title'),
      description: t('cli.description'),
      href: `/${locale}/docs/cli`,
    },
    {
      icon: Code,
      title: t('api.title'),
      description: t('api.description'),
      href: `/${locale}/docs/api`,
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {docs.map((doc, index) => (
                <Link
                  key={index}
                  href={doc.href}
                  className="card p-6 text-center hover:border-primary-500 transition-colors"
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary-50 text-primary-600 mb-4">
                    <doc.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{doc.title}</h3>
                  <p className="text-text-secondary">{doc.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
