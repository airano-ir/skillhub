import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ApiEndpointSection } from '@/components/ApiEndpointSection';
import type { EndpointDef } from '@/components/ApiEndpointSection';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Search, FileCode, Users, Compass, Mail } from 'lucide-react';
import { getPageAlternates } from '@/lib/seo';



export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/docs/api'),
  };
}

export default async function ApiDocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');
  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

  const labels = {
    parameters: t('api.labels.parameters'),
    requestBody: t('api.labels.requestBody'),
    required: t('api.labels.required'),
    optional: t('api.labels.optional'),
    default: t('api.labels.default'),
    responseExample: t('api.labels.responseExample'),
    rateLimit: t('api.labels.rateLimit'),
    cache: t('api.labels.cache'),
    authRequired: t('api.labels.authRequired'),
    notes: t('api.labels.notes'),
  };

  // --- Section 1: Skills ---
  const skillsEndpoints: EndpointDef[] = [
    {
      method: 'GET',
      path: '/api/skills',
      description: t('api.endpoints.searchSkills'),
      auth: false,
      rateLimit: '60 req/min',
      cacheTTL: '5 min',
      params: [
        { name: 'q', type: 'string', required: false, description: t('api.params.q') },
        { name: 'category', type: 'string', required: false, description: t('api.params.category') },
        { name: 'platform', type: 'string', required: false, description: t('api.params.platform') + ' (claude, codex, copilot, cursor, windsurf)' },
        { name: 'format', type: 'string', required: false, description: t('api.params.format'), default: 'skill.md' },
        { name: 'verified', type: 'boolean', required: false, description: t('api.params.verified') },
        { name: 'minStars', type: 'number', required: false, description: t('api.params.minStars') },
        { name: 'sort', type: 'string', required: false, description: t('api.params.sort') + ' (stars, downloads, rating, recent)', default: 'downloads' },
        { name: 'page', type: 'number', required: false, description: t('api.params.page'), default: '1' },
        { name: 'limit', type: 'number', required: false, description: t('api.params.limit'), default: '20' },
      ],
      responseExample: `{
  "skills": [
    {
      "id": "anthropic/skills/code-review",
      "name": "code-review",
      "description": "AI-powered code review assistant",
      "githubOwner": "anthropic",
      "githubRepo": "skills",
      "githubStars": 1234,
      "downloadCount": 567,
      "securityStatus": "PASS",
      "rating": 4.5,
      "ratingCount": 23,
      "isVerified": true,
      "compatibility": { "platforms": ["claude", "cursor"] }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "searchEngine": "meilisearch"
}`,
      notes: t('api.notes.searchFallback'),
    },
    {
      method: 'GET',
      path: '/api/skills/:id',
      description: t('api.endpoints.getSkill'),
      auth: false,
      rateLimit: '120 req/min',
      responseExample: `{
  "id": "anthropic/skills/code-review",
  "name": "code-review",
  "description": "AI-powered code review assistant",
  "githubOwner": "anthropic",
  "githubRepo": "skills",
  "skillPath": "code-review",
  "branch": "main",
  "version": "1.0.0",
  "license": "MIT",
  "githubStars": 1234,
  "downloadCount": 567,
  "securityScore": 95,
  "securityStatus": "PASS",
  "isVerified": true,
  "compatibility": { "platforms": ["claude"] },
  "rawContent": "# Code Review\\n...",
  "sourceFormat": "skill.md"
}`,
      notes: t('api.notes.viewCount'),
    },
    {
      method: 'GET',
      path: '/api/skills/featured',
      description: t('api.endpoints.featuredSkills'),
      auth: false,
      rateLimit: '120 req/min',
      cacheTTL: '2 hours',
      params: [
        { name: 'limit', type: 'number', required: false, description: t('api.params.limitNum'), default: '6' },
      ],
    },
    {
      method: 'GET',
      path: '/api/skills/recent',
      description: t('api.endpoints.recentSkills'),
      auth: false,
      rateLimit: '120 req/min',
      cacheTTL: '1 hour',
      params: [
        { name: 'limit', type: 'number', required: false, description: t('api.params.limitNum'), default: '10' },
      ],
    },
    {
      method: 'POST',
      path: '/api/skills/install',
      description: t('api.endpoints.trackInstall'),
      auth: false,
      bodyParams: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
        { name: 'platform', type: 'string', required: false, description: t('api.params.platform') },
        { name: 'method', type: 'string', required: false, description: t('api.params.method') },
      ],
      responseExample: `{ "success": true, "skillId": "owner/repo/skill", "platform": "claude", "method": "cli" }`,
      notes: t('api.notes.installDedup'),
    },
    {
      method: 'POST',
      path: '/api/skills/add-request',
      description: t('api.endpoints.addRequest'),
      auth: true,
      bodyParams: [
        { name: 'repositoryUrl', type: 'string', required: true, description: t('api.params.repositoryUrl') },
        { name: 'reason', type: 'string', required: false, description: t('api.params.reason') },
      ],
      responseExample: `{ "success": true, "requestId": "uuid", "hasSkillMd": true, "skillCount": 3 }`,
    },
    {
      method: 'POST',
      path: '/api/skills/removal-request',
      description: t('api.endpoints.removalRequest'),
      auth: true,
      bodyParams: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
        { name: 'reason', type: 'string', required: false, description: t('api.params.reason') },
      ],
      responseExample: `{ "success": true, "requestId": "uuid", "blocked": true }`,
    },
  ];

  // --- Section 2: Skill Files ---
  const skillFilesEndpoints: EndpointDef[] = [
    {
      method: 'GET',
      path: '/api/skill-files',
      description: t('api.endpoints.getSkillFiles'),
      auth: false,
      rateLimit: '60 req/min',
      params: [
        { name: 'id', type: 'string', required: true, description: t('api.params.skillId') },
      ],
      responseExample: `{
  "skillId": "owner/repo/skill",
  "githubOwner": "owner",
  "githubRepo": "repo",
  "skillPath": "skill",
  "branch": "main",
  "files": [
    {
      "name": "SKILL.md",
      "path": "SKILL.md",
      "type": "file",
      "size": 2048,
      "content": "# Skill Name\\n..."
    }
  ],
  "fromCache": true,
  "cachedAt": "2026-01-15T10:30:00Z"
}`,
      notes: t('api.notes.cacheInDB'),
    },
    {
      method: 'GET',
      path: '/api/skill-files/zip',
      description: t('api.endpoints.downloadZip'),
      auth: false,
      rateLimit: '60 req/min',
      params: [
        { name: 'id', type: 'string', required: true, description: t('api.params.skillId') },
        { name: 'platform', type: 'string', required: false, description: t('api.params.platformZip'), default: 'claude' },
      ],
      notes: t('api.notes.zipTransform'),
    },
  ];

  // --- Section 3: User Actions ---
  const userActionsEndpoints: EndpointDef[] = [
    {
      method: 'GET',
      path: '/api/ratings',
      description: t('api.endpoints.getRatings'),
      auth: false,
      rateLimit: '120 req/min',
      params: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
        { name: 'limit', type: 'number', required: false, description: t('api.params.limitNum'), default: '10' },
        { name: 'offset', type: 'number', required: false, description: t('api.params.offset'), default: '0' },
      ],
      responseExample: `{
  "ratings": [
    {
      "id": "uuid",
      "rating": 5,
      "review": "Great skill!",
      "createdAt": "2026-01-10T00:00:00Z",
      "user": { "id": "uid", "username": "user1", "avatarUrl": "https://..." }
    }
  ],
  "summary": { "average": 4.5, "count": 23 }
}`,
    },
    {
      method: 'POST',
      path: '/api/ratings',
      description: t('api.endpoints.createRating'),
      auth: true,
      rateLimit: '600 req/min',
      bodyParams: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
        { name: 'rating', type: 'number', required: true, description: t('api.params.rating') },
        { name: 'review', type: 'string', required: false, description: t('api.params.review') },
      ],
      responseExample: `{ "rating": { "id": "uuid", "rating": 5, "review": "..." }, "summary": { "average": 4.5, "count": 24 } }`,
    },
    {
      method: 'GET',
      path: '/api/ratings/me',
      description: t('api.endpoints.getMyRating'),
      auth: true,
      rateLimit: '600 req/min',
      params: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
      ],
      responseExample: `{ "rating": { "id": "uuid", "rating": 5, "review": "Great!" } }`,
    },
    {
      method: 'GET',
      path: '/api/favorites',
      description: t('api.endpoints.getFavorites'),
      auth: true,
      rateLimit: '600 req/min',
      responseExample: `{
  "favorites": [
    {
      "id": "owner/repo/skill",
      "name": "skill-name",
      "description": "...",
      "githubStars": 100,
      "downloadCount": 50,
      "securityStatus": "PASS",
      "isVerified": true,
      "rating": 4.5,
      "ratingCount": 10
    }
  ]
}`,
    },
    {
      method: 'POST',
      path: '/api/favorites',
      description: t('api.endpoints.addFavorite'),
      auth: true,
      rateLimit: '600 req/min',
      bodyParams: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
      ],
      responseExample: `{ "success": true, "favorited": true }`,
    },
    {
      method: 'DELETE',
      path: '/api/favorites',
      description: t('api.endpoints.removeFavorite'),
      auth: true,
      rateLimit: '600 req/min',
      bodyParams: [
        { name: 'skillId', type: 'string', required: true, description: t('api.params.skillId') },
      ],
      responseExample: `{ "success": true, "favorited": false }`,
    },
    {
      method: 'POST',
      path: '/api/favorites/check',
      description: t('api.endpoints.checkFavorites'),
      auth: true,
      rateLimit: '600 req/min',
      bodyParams: [
        { name: 'skillIds', type: 'string[]', required: true, description: t('api.params.skillIds') },
      ],
      responseExample: `{ "favorited": { "owner/repo/skill-a": true, "owner/repo/skill-b": false } }`,
    },
  ];

  // --- Section 4: Discovery & Metadata ---
  const discoveryEndpoints: EndpointDef[] = [
    {
      method: 'GET',
      path: '/api/categories',
      description: t('api.endpoints.getCategories'),
      auth: false,
      rateLimit: '120 req/min',
      cacheTTL: '12 hours',
      responseExample: `{
  "categories": [
    {
      "id": "cat-id",
      "name": "Code Quality",
      "slug": "code-quality",
      "description": "...",
      "icon": "🔍",
      "skillCount": 15,
      "sortOrder": 1
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/stats',
      description: t('api.endpoints.getStats'),
      auth: false,
      rateLimit: '120 req/min',
      cacheTTL: '1 hour',
      responseExample: `{
  "totalSkills": 850,
  "totalDownloads": 12500,
  "totalCategories": 23,
  "totalContributors": 320,
  "platforms": 5
}`,
    },
    {
      method: 'GET',
      path: '/api/health',
      description: t('api.endpoints.healthCheck'),
      auth: false,
      responseExample: `{
  "status": "healthy",
  "timestamp": "2026-02-11T12:00:00Z",
  "version": "0.2.4",
  "isPrimary": true,
  "services": {
    "database": { "status": "healthy", "latency": 5 },
    "meilisearch": { "status": "healthy", "latency": 12 },
    "redis": { "status": "healthy", "latency": 3 }
  }
}`,
    },
    {
      method: 'GET',
      path: '/api/attribution',
      description: t('api.endpoints.getAttribution'),
      auth: false,
      rateLimit: '120 req/min',
      cacheTTL: '1 hour',
      responseExample: `{
  "totalSkills": 850,
  "totalContributors": 320,
  "totalRepos": 150,
  "licenseDistribution": [
    { "license": "MIT", "count": 50, "percentage": 50 }
  ],
  "lastUpdated": "2026-02-11T00:00:00Z"
}`,
    },
  ];

  // --- Section 5: Newsletter ---
  const newsletterEndpoints: EndpointDef[] = [
    {
      method: 'POST',
      path: '/api/newsletter/subscribe',
      description: t('api.endpoints.subscribe'),
      auth: false,
      rateLimit: '60 req/min',
      bodyParams: [
        { name: 'email', type: 'string', required: true, description: t('api.params.email') },
        { name: 'source', type: 'string', required: false, description: t('api.params.source') },
        { name: 'locale', type: 'string', required: false, description: t('api.params.locale'), default: 'en' },
      ],
      responseExample: `{ "success": true, "subscribed": true }`,
    },
    {
      method: 'POST',
      path: '/api/newsletter/unsubscribe',
      description: t('api.endpoints.unsubscribe'),
      auth: false,
      rateLimit: '60 req/min',
      bodyParams: [
        { name: 'email', type: 'string', required: true, description: t('api.params.email') },
      ],
      responseExample: `{ "success": true, "unsubscribed": true }`,
      notes: t('api.notes.alwaysSuccess'),
    },
  ];

  const sections = [
    { title: t('api.sections.skills.title'), description: t('api.sections.skills.description'), icon: Search, endpoints: skillsEndpoints },
    { title: t('api.sections.skillFiles.title'), description: t('api.sections.skillFiles.description'), icon: FileCode, endpoints: skillFilesEndpoints },
    { title: t('api.sections.userActions.title'), description: t('api.sections.userActions.description'), icon: Users, endpoints: userActionsEndpoints },
    { title: t('api.sections.discovery.title'), description: t('api.sections.discovery.description'), icon: Compass, endpoints: discoveryEndpoints },
    { title: t('api.sections.newsletter.title'), description: t('api.sections.newsletter.description'), icon: Mail, endpoints: newsletterEndpoints },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section bg-surface">
          <div className="container-main">
            <div className="max-w-4xl mx-auto">
              <Link
                href={`/${locale}/docs`}
                className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-8"
              >
                <ArrowIcon className="w-4 h-4 rotate-180" />
                {t('title')}
              </Link>

              <h1 className="text-4xl font-bold mb-4">{t('api.title')}</h1>
              <p className="text-lg text-text-secondary mb-10">{t('api.description')}</p>

              {/* Base URL */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-3">{t('api.baseUrl')}</h2>
                <div className="glass-card p-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">{siteUrl}</code>
                </div>
              </div>

              {/* Authentication */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-3">{t('api.authSection.title')}</h2>
                <p className="text-text-secondary mb-2">{t('api.authSection.description')}</p>
                <p className="text-text-secondary text-sm">{t('api.authSection.howTo')}</p>
              </div>

              {/* Rate Limiting */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-3">{t('api.rateLimitSection.title')}</h2>
                <p className="text-text-secondary mb-4">{t('api.rateLimitSection.description')}</p>
                <div className="glass-card overflow-hidden mb-4" dir="ltr">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-border/50 bg-surface-hover/50">
                        <th className="py-2.5 px-4 font-medium">{t('api.rateLimitSection.tier')}</th>
                        <th className="py-2.5 px-4 font-medium">{t('api.rateLimitSection.limit')}</th>
                        <th className="py-2.5 px-4 font-medium">{t('api.rateLimitSection.use')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/30">
                        <td className="py-2 px-4 font-mono text-xs">{t('api.rateLimitSection.anonymous')}</td>
                        <td className="py-2 px-4">120 req/min</td>
                        <td className="py-2 px-4 text-text-secondary">{t('api.rateLimitSection.anonymousUse')}</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-2 px-4 font-mono text-xs">{t('api.rateLimitSection.search')}</td>
                        <td className="py-2 px-4">60 req/min</td>
                        <td className="py-2 px-4 text-text-secondary">{t('api.rateLimitSection.searchUse')}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-mono text-xs">{t('api.rateLimitSection.authenticated')}</td>
                        <td className="py-2 px-4">600 req/min</td>
                        <td className="py-2 px-4 text-text-secondary">{t('api.rateLimitSection.authenticatedUse')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div dir="ltr">
                  <h3 className="text-sm font-semibold mb-2 text-left">{t('api.rateLimitSection.headersTitle')}</h3>
                  <div className="space-y-1 text-sm text-left">
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">X-RateLimit-Limit</code> — {t('api.rateLimitSection.headerLimit')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">X-RateLimit-Remaining</code> — {t('api.rateLimitSection.headerRemaining')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">X-RateLimit-Reset</code> — {t('api.rateLimitSection.headerReset')}</p>
                  </div>
                </div>
              </div>

              {/* Error Responses */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-3">{t('api.errorSection.title')}</h2>
                <p className="text-text-secondary mb-4">{t('api.errorSection.description')}</p>
                <div className="glass-card p-4 mb-4" dir="ltr">
                  <pre className="text-sm font-mono overflow-x-auto text-left">{`{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": 45,
  "limit": 60
}`}</pre>
                </div>
                <div dir="ltr">
                  <h3 className="text-sm font-semibold mb-2 text-left">{t('api.errorSection.commonCodes')}</h3>
                  <div className="space-y-1 text-sm text-left">
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">400</code> — {t('api.errorSection.code400')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">401</code> — {t('api.errorSection.code401')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">404</code> — {t('api.errorSection.code404')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">429</code> — {t('api.errorSection.code429')}</p>
                    <p><code className="font-mono text-xs bg-surface-hover px-1.5 py-0.5 rounded">500</code> — {t('api.errorSection.code500')}</p>
                  </div>
                </div>
              </div>

              {/* Quick example */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-3">Quick Example</h2>
                <div className="glass-card p-4" dir="ltr">
                  <code className="text-sm font-mono whitespace-pre-wrap text-left block">{`curl "${siteUrl}/api/skills?q=code-review&limit=5"`}</code>
                </div>
              </div>

              <hr className="border-border/50 mb-10" />

              {/* Endpoint Sections */}
              {sections.map((section, index) => (
                <ApiEndpointSection
                  key={index}
                  title={section.title}
                  description={section.description}
                  endpoints={section.endpoints}
                  labels={labels}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
