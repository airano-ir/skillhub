import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skills, discoveredRepos, awesomeLists, sql } from '@skillhub/db';
import { getCached, setCache, cacheTTL } from '@/lib/cache';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

interface AttributionStats {
  totalSkills: number;
  totalContributors: number;
  totalRepos: number;
  awesomeLists: {
    count: number;
    totalRepos: number;
  };
  forkNetworks: number;
  licenseDistribution: Array<{
    license: string;
    count: number;
    percentage: number;
  }>;
  discoveryBySource: Array<{
    source: string;
    count: number;
    withSkills: number;
  }>;
  lastUpdated: string;
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    // Try to get from cache first (cache for 1 hour)
    const cacheKey = 'attribution:stats';
    const cached = await getCached<AttributionStats>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
          ...createRateLimitHeaders(rateLimitResult),
        },
      });
    }

    // Get total skills and contributors
    const skillStats = await db
      .select({
        totalSkills: sql<number>`count(*)::int`,
        totalContributors: sql<number>`count(distinct ${skills.githubOwner})::int`,
      })
      .from(skills);

    // Get license distribution
    const licenseStats = await db
      .select({
        license: sql<string>`coalesce(${skills.license}, 'Unspecified')`,
        count: sql<number>`count(*)::int`,
      })
      .from(skills)
      .groupBy(sql`coalesce(${skills.license}, 'Unspecified')`)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const totalForPercentage = skillStats[0]?.totalSkills ?? 1;
    const licenseDistribution = licenseStats.map((l) => ({
      license: l.license || 'Unspecified',
      count: l.count,
      percentage: Math.round((l.count / totalForPercentage) * 100),
    }));

    // Get discovered repos stats
    const repoStats = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoveredRepos);

    // Get discovery by source
    const bySource = await db
      .select({
        source: discoveredRepos.discoveredVia,
        count: sql<number>`count(*)::int`,
        withSkills: sql<number>`sum(case when has_skill_md then 1 else 0 end)::int`,
      })
      .from(discoveredRepos)
      .groupBy(discoveredRepos.discoveredVia);

    // Get fork networks count
    const forkCount = bySource.find((s) => s.source === 'fork-network');

    // Get awesome lists stats
    const awesomeStats = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalRepos: sql<number>`coalesce(sum(${awesomeLists.repoCount}), 0)::int`,
      })
      .from(awesomeLists)
      .where(sql`${awesomeLists.isActive} = true`);

    const data: AttributionStats = {
      totalSkills: skillStats[0]?.totalSkills ?? 0,
      totalContributors: skillStats[0]?.totalContributors ?? 0,
      totalRepos: repoStats[0]?.count ?? 0,
      awesomeLists: {
        count: awesomeStats[0]?.count ?? 0,
        totalRepos: awesomeStats[0]?.totalRepos ?? 0,
      },
      forkNetworks: forkCount?.count ?? 0,
      licenseDistribution,
      discoveryBySource: bySource.map((s) => ({
        source: s.source ?? 'unknown',
        count: s.count,
        withSkills: s.withSkills ?? 0,
      })),
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result for 1 hour
    await setCache(cacheKey, data, cacheTTL.stats);

    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    console.error('Error fetching attribution stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attribution stats' },
      { status: 500 }
    );
  }
}
