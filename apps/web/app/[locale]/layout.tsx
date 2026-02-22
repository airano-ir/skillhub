import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, localeDirection, type Locale } from '@/i18n';
import { Providers } from '../providers';
import { Suspense } from 'react';
import { QueryNotification } from '@/components/QueryNotification';
import { ProgressBar } from '@/components/ProgressBar';
import '../globals.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  const primaryDomain = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

  return {
    title: {
      default: t('title'),
      template: `%s | SkillHub`,
    },
    description: t('description'),
    keywords: ['AI', 'Agent', 'Skills', 'Claude', 'Codex', 'Copilot', 'Marketplace'],
    authors: [{ name: 'SkillHub' }],
    icons: {
      icon: '/logo.svg',
      shortcut: '/logo.svg',
      apple: '/logo.svg',
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      type: 'website',
      locale: locale === 'fa' ? 'fa_IR' : 'en_US',
      url: `${primaryDomain}/${locale}`,
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = localeDirection[locale as Locale];

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen bg-surface">
        <Providers>
          <NextIntlClientProvider messages={messages}>
            <Suspense fallback={null}>
              <QueryNotification />
            </Suspense>
            <ProgressBar />
            {children}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  );
}
