import type { MetadataRoute } from 'next';
import { createDb, skillQueries, categoryQueries } from '@skillhub/db';
import { getCanonicalPath, primaryDomain as BASE_URL } from '@/lib/seo';

const locales = ['en', 'fa'] as const;

const staticRoutes = [
  '',
  '/browse',
  '/categories',
  '/featured',
  '/new',
  '/docs',
  '/docs/getting-started',
  '/docs/cli',
  '/docs/api',
  '/about',
  '/attribution',
  '/claude-plugin',
  '/claim',
  '/contact',
  '/support',
  '/terms',
  '/privacy',
];

function makeEntry(
  locale: string,
  route: string,
  options?: {
    lastModified?: Date;
    changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority?: number;
  }
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE_URL}${getCanonicalPath(locale, route)}`,
    lastModified: options?.lastModified,
    changeFrequency: options?.changeFrequency,
    priority: options?.priority,
    alternates: {
      languages: Object.fromEntries(
        locales.map((l) => [l, `${BASE_URL}${getCanonicalPath(l, route)}`])
      ),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Mirror servers should not serve a sitemap (robots.txt already blocks crawlers)
  const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
  if (!isPrimary) {
    return [];
  }

  const db = createDb();
  const entries: MetadataRoute.Sitemap = [];

  // Static pages (for each locale)
  for (const locale of locales) {
    for (const route of staticRoutes) {
      const isHome = route === '';
      entries.push(
        makeEntry(locale, route, {
          changeFrequency: isHome ? 'daily' : 'weekly',
          priority: isHome ? 1.0 : 0.5,
        })
      );
    }
  }

  // Dynamic: skill pages
  try {
    const allSkills = await skillQueries.getAllForSitemap(db);

    for (const skill of allSkills) {
      for (const locale of locales) {
        entries.push(
          makeEntry(locale, `/skill/${skill.id}`, {
            lastModified: skill.updatedAt,
            changeFrequency: 'weekly',
            priority: 0.7,
          })
        );
      }
    }

    // Dynamic: owner pages (unique owners from skills)
    const uniqueOwners = new Map<string, Date>();
    for (const skill of allSkills) {
      const existing = uniqueOwners.get(skill.githubOwner);
      if (!existing || skill.updatedAt > existing) {
        uniqueOwners.set(skill.githubOwner, skill.updatedAt);
      }
    }

    for (const [owner, lastModified] of uniqueOwners) {
      for (const locale of locales) {
        entries.push(
          makeEntry(locale, `/owner/${owner}`, {
            lastModified,
            changeFrequency: 'weekly',
            priority: 0.6,
          })
        );
      }
    }
  } catch {
    // If DB is unavailable, return static pages only
  }

  // Dynamic: category pages
  try {
    const allCategories = await categoryQueries.getAll(db);
    for (const category of allCategories) {
      for (const locale of locales) {
        entries.push(
          makeEntry(locale, `/browse?category=${category.slug}`, {
            changeFrequency: 'weekly',
            priority: 0.5,
          })
        );
      }
    }
  } catch {
    // If DB is unavailable, skip categories
  }

  return entries;
}
