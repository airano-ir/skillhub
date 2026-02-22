import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import {
  Brain,
  Bot,
  Sparkles,
  Monitor,
  Server,
  Cloud,
  Database,
  GitBranch,
  CheckCircle,
  Shield,
  FileText,
  PenTool,
  Smartphone,
  Layers,
  Code,
  Code2,
  Package,
  StickyNote,
  Home,
  Music,
  MessageCircle,
  Briefcase,
  Calculator,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import { createDb, categoryQueries } from '@skillhub/db';
import { formatNumber } from '@/lib/format-number';
import { getPageAlternates } from '@/lib/seo';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';


// Force dynamic rendering to fetch fresh data from database
export const dynamic = 'force-dynamic';

// Map category slugs to Lucide icons (23 categories + 7 parents)
const iconMap: Record<string, LucideIcon> = {
  // Original 16 categories
  'ai-llm': Brain,
  'git-version-control': GitBranch,
  'data-database': Database,
  'backend-apis': Server,
  'frontend-ui': Monitor,
  'agents-orchestration': Bot,
  'testing-qa': CheckCircle,
  'devops-cloud': Cloud,
  'programming-languages': Code,
  'documents-files': FileText,
  'security-auth': Shield,
  'mcp-skills': Layers,
  'prompts-instructions': Sparkles,
  'content-writing': PenTool,
  'mobile-development': Smartphone,
  'other-utilities': Package,

  // New categories from Phase 1
  'productivity-notes': StickyNote,
  'smart-home-iot': Home,
  'multimedia-audio-video': Music,
  'social-communications': MessageCircle,
  'business-finance': Briefcase,
  'science-mathematics': Calculator,
  'blockchain-web3': Coins,

  // Parent categories from Phase 2
  'development': Code2,
  'ai-automation': Brain,
  'data-documents': Database,
  'devops-security': Cloud,
  'business-productivity': Briefcase,
  'media-iot': Music,
  'specialized': Sparkles,
};

// Color map for parent categories
const parentColorMap: Record<string, string> = {
  'development': 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  'ai-automation': 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  'data-documents': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  'devops-security': 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
  'business-productivity': 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
  'media-iot': 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  'specialized': 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// Get categories hierarchically with Redis caching (12 hour TTL)
async function getHierarchicalCategories() {
  try {
    return await getOrSetCache(cacheKeys.categoriesHierarchical(), cacheTTL.categories, async () => {
      const db = createDb();
      return await categoryQueries.getHierarchical(db);
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/categories'),
  };
}

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('categories');

  const hierarchicalCategories = await getHierarchicalCategories();

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
            {hierarchicalCategories.map((parent) => {
              const ParentIcon = iconMap[parent.slug] || Code;
              const colorClass = parentColorMap[parent.slug] || 'bg-primary-50 text-primary-600';

              return (
                <div key={parent.id} className="mb-12 last:mb-0">
                  {/* Parent Section Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center`}>
                      <ParentIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-text-primary">
                        {t(`parents.${parent.slug}`) || parent.name}
                      </h2>
                      <p className="text-text-muted text-sm">{parent.description}</p>
                    </div>
                  </div>

                  {/* Child Categories Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {parent.children?.map((category) => {
                      const IconComponent = iconMap[category.slug] || Code;
                      return (
                        <Link
                          key={category.id}
                          href={`/${locale}/browse?category=${category.id}`}
                          className="card p-5 flex items-center gap-4 border border-transparent hover:border-primary-500 transition-all hover:shadow-md"
                        >
                          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                            <IconComponent className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-text-primary truncate">
                              {t(`names.${category.slug}`) || category.name}
                            </h3>
                            <p className="text-text-muted text-sm ltr-nums">
                              {formatNumber(category.skillCount || 0, locale)} {t('skillCount')}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
