import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FavoritesList } from '@/components/FavoritesList';
import { FavoritesSignIn } from '@/components/FavoritesSignIn';
import { createDb, userQueries } from '@skillhub/db';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface FavoritesPageProps {
  params: Promise<{ locale: string }>;
}

export default async function FavoritesPage({ params }: FavoritesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('favorites');
  const tCommon = await getTranslations('common');

  const session = await auth();

  const isLoggedIn = !!session?.user?.githubId;

  // Get favorites only if logged in
  let favorites: Awaited<ReturnType<typeof userQueries.getFavorites>> = [];
  if (isLoggedIn) {
    const db = createDb();
    const dbUser = await userQueries.getByGithubId(db, session.user.githubId!);
    favorites = dbUser ? await userQueries.getFavorites(db, dbUser.id) : [];
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <div className="bg-surface border-b border-border">
          <div className="container-main py-8">
            <div className="flex items-center gap-3 mb-2">
              <Heart className="w-8 h-8 text-red-500 fill-red-500" />
              <h1 className="text-3xl font-bold text-text-primary">{t('title')}</h1>
            </div>
            <p className="text-text-secondary">{t('subtitle')}</p>
          </div>
        </div>

        <div className="container-main py-8">
          {isLoggedIn ? (
            <FavoritesList
              initialFavorites={favorites}
              locale={locale}
              translations={{
                verified: tCommon('verified'),
                emptyTitle: t('empty.title'),
                emptyDescription: t('empty.description'),
                emptyCta: t('empty.cta'),
              }}
            />
          ) : (
            <FavoritesSignIn
              translations={{
                loginRequired: t('loginRequired'),
                signIn: t('signIn'),
              }}
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
