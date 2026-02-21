import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skills, categories, sql } from '@skillhub/db';
import { getCached, setCache, cacheKeys, cacheTTL } from '@/lib/cache';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

interface StatsData {
  totalSkills: number;
  totalDownloads: number;
  totalCategories: number;
  totalContributors: number;
  platforms: number;
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    // Try to get from cache first
    const cacheKey = cacheKeys.stats();
    const cached = await getCached<StatsData>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
          ...createRateLimitHeaders(rateLimitResult),
        },
      });
    }

    // Browse-ready filter: exclude duplicates (matches browseReadyFilter in queries.ts)
    const browseReady = sql`${skills.isDuplicate} = false`;

    // Browse-ready skill stats (skills count + contributors)
    const statsResult = await db
      .select({
        totalSkills: sql<number>`count(*)::int`,
        totalContributors: sql<number>`count(distinct ${skills.githubOwner})::int`,
      })
      .from(skills)
      .where(browseReady);

    // Total downloads: count ALL downloads (real user actions, not filtered)
    const downloadsResult = await db
      .select({
        totalDownloads: sql<number>`coalesce(sum(${skills.downloadCount}), 0)::int`,
      })
      .from(skills);

    // Get category count in separate query (different table)
    const categoryResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories);

    const stats = statsResult[0];
    const totalCategories = categoryResult[0]?.count ?? 0;

    const data: StatsData = {
      totalSkills: stats?.totalSkills ?? 0,
      totalDownloads: downloadsResult[0]?.totalDownloads ?? 0,
      totalCategories,
      totalContributors: stats?.totalContributors ?? 0,
      platforms: 5, // Claude, Codex, Copilot, Cursor, Windsurf
    };

    // Cache the result
    await setCache(cacheKey, data, cacheTTL.stats);

    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
