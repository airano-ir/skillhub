import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ClaimForm } from '@/components/ClaimForm';
import { getPageAlternates } from '@/lib/seo';


export const dynamic = 'force-dynamic';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/claim'),
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('claim');

  const translations = {
    title: t('title'),
    subtitle: t('subtitle'),
    loginRequired: t('loginRequired'),
    signIn: t('signIn'),
    optional: t('optional'),
    mirror: {
      title: t('mirror.title'),
      description: t('mirror.description'),
      button: t('mirror.button'),
    },
    tabs: {
      remove: t('tabs.remove'),
      add: t('tabs.add'),
    },
    form: {
      skillId: t('form.skillId'),
      skillIdPlaceholder: t('form.skillIdPlaceholder'),
      skillIdHelp: t('form.skillIdHelp'),
      reason: t('form.reason'),
      reasonPlaceholder: t('form.reasonPlaceholder'),
      submit: t('form.submit'),
      submitting: t('form.submitting'),
    },
    addForm: {
      repositoryUrl: t('addForm.repositoryUrl'),
      repositoryUrlPlaceholder: t('addForm.repositoryUrlPlaceholder'),
      repositoryUrlHelp: t('addForm.repositoryUrlHelp'),
      reason: t('addForm.reason'),
      reasonPlaceholder: t('addForm.reasonPlaceholder'),
      submit: t('addForm.submit'),
      submitting: t('addForm.submitting'),
    },
    success: {
      title: t('success.title'),
      description: t('success.description'),
      pendingTitle: t('success.pendingTitle'),
      pendingDescription: t('success.pendingDescription'),
      viewRequests: t('success.viewRequests'),
    },
    addSuccess: {
      title: t('addSuccess.title'),
      description: t('addSuccess.description'),
      descriptionNoSkillMd: t('addSuccess.descriptionNoSkillMd'),
      descriptionMultiplePrefix: t('addSuccess.descriptionMultiplePrefix'),
      descriptionMultipleSuffix: t('addSuccess.descriptionMultipleSuffix'),
      viewRequests: t('addSuccess.viewRequests'),
      foundSkillsIn: t('addSuccess.foundSkillsIn'),
      root: t('addSuccess.root'),
      andMore: t.raw('addSuccess.andMore') as string,
    },
    error: {
      notOwner: t('error.notOwner'),
      skillNotFound: t('error.skillNotFound'),
      alreadyPending: t('error.alreadyPending'),
      githubError: t('error.githubError'),
      invalidSkill: t('error.invalidSkill'),
      invalidUrl: t('error.invalidUrl'),
      invalidRepo: t('error.invalidRepo'),
      rateLimitExceeded: t('error.rateLimitExceeded'),
      networkTimeout: t('error.networkTimeout'),
      generic: t('error.generic'),
    },
    myRequests: {
      title: t('myRequests.title'),
      empty: t('myRequests.empty'),
      status: {
        pending: t('myRequests.status.pending'),
        approved: t('myRequests.status.approved'),
        rejected: t('myRequests.status.rejected'),
        indexed: t('myRequests.status.indexed'),
      },
      skillsFoundPrefix: t('myRequests.skillsFoundPrefix'),
      skillsFoundSuffix: t('myRequests.skillsFoundSuffix'),
      showLess: t('myRequests.showLess'),
      showAllPrefix: t('myRequests.showAllPrefix'),
      showAllSuffix: t('myRequests.showAllSuffix'),
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section-header bg-gradient-subtle">
          <div className="container-main text-center">
            <h1 className="hero-title mb-4">{translations.title}</h1>
            <p className="hero-subtitle max-w-2xl mx-auto">{translations.subtitle}</p>
          </div>
        </section>

        <section className="section bg-surface">
          <div className="container-main max-w-2xl">
            <ClaimForm translations={translations} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
