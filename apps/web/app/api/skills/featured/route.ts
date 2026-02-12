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
}

interface FeaturedResponse {
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
    const limit = parseInt(searchParams.get('limit') || '6');

    // Try to get from cache first (only for default limit)
    const cacheKey = cacheKeys.featuredSkills();
    if (limit === 6) {
      const cached = await getCached<FeaturedResponse>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', ...createRateLimitHeaders(rateLimitResult) },
        });
      }
    }

    // Get featured skills, fallback to popularity-based ranking
    // Uses adaptive algorithm: quality + freshness + engagement
    let featuredSkills = await skillQueries.getFeatured(db, limit);

    // If no manually featured skills, use adaptive popularity with owner/repo diversity
    if (featuredSkills.length === 0) {
      featuredSkills = await skillQueries.getFeaturedWithDiversity(db, limit, 2, 3);
    }

    const data: FeaturedResponse = {
      skills: featuredSkills.map((skill: Skill) => ({
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
      })),
    };

    // Cache the result (2 hours)
    if (limit === 6) {
      await setCache(cacheKey, data, cacheTTL.featured);
    }

    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', ...createRateLimitHeaders(rateLimitResult) },
    });
  } catch (error) {
    console.error('Error fetching featured skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch featured skills' },
      { status: 500 }
    );
  }
}
