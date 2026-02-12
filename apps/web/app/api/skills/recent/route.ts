import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries, type skills } from '@skillhub/db';
import { getCached, setCache, cacheKeys, cacheTTL } from '@/lib/cache';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

type Skill = typeof skills.$inferSelect;

interface SkillData {
  id: string;
  name: string;
  description: string | null;
  githubOwner: string;
  githubRepo: string;
  githubStars: number | null;
  downloadCount: number | null;
  securityStatus: string | null;
  isVerified: boolean | null;
  compatibility: unknown;
  updatedAt: Date | null;
  createdAt: Date | null;
}

interface RecentResponse {
  skills: SkillData[];
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // Try to get from cache first (only for default limit)
    const cacheKey = cacheKeys.recentSkills();
    if (limit === 10) {
      const cached = await getCached<RecentResponse>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', ...createRateLimitHeaders(rateLimitResult) },
        });
      }
    }

    const recentSkills = await skillQueries.getRecent(db, limit);

    const data: RecentResponse = {
      skills: recentSkills.map((skill: Skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        githubOwner: skill.githubOwner,
        githubRepo: skill.githubRepo,
        githubStars: skill.githubStars,
        downloadCount: skill.downloadCount,
        securityStatus: skill.securityStatus,
        isVerified: skill.isVerified,
        compatibility: skill.compatibility,
        updatedAt: skill.updatedAt,
        createdAt: skill.createdAt,
      })),
    };

    // Cache the result (1 hour)
    if (limit === 10) {
      await setCache(cacheKey, data, cacheTTL.recent);
    }

    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', ...createRateLimitHeaders(rateLimitResult) },
    });
  } catch (error) {
    console.error('Error fetching recent skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent skills' },
      { status: 500 }
    );
  }
}
