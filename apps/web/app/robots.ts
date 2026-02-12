import type { MetadataRoute } from 'next';

/**
 * Dynamic robots.txt for mirror server support
 *
 * Primary server (IS_PRIMARY_SERVER=true): Allow all crawlers
 * Mirror server (IS_PRIMARY_SERVER=false): Block all crawlers to prevent duplicate content
 */
export default function robots(): MetadataRoute.Robots {
  const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
  const primaryDomain = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

  if (isPrimary) {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/monitoring/'],
        },
      ],
      sitemap: `${primaryDomain}/sitemap.xml`,
    };
  }

  // Mirror server: Block all crawlers to prevent duplicate content indexing
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
    // Point to primary sitemap even on mirror
    sitemap: `${primaryDomain}/sitemap.xml`,
  };
}
