import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skillReviewQueries } from '@skillhub/db';
import { requireAdmin } from '@/lib/admin-auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { getCached, setCache, cacheKeys, cacheTTL } from '@/lib/cache';

const db = createDb();

interface ReviewStatsData {
  total_skills: number;
  ai_reviewed: number;
  needs_re_review: number;
  total_reviews: number;
}

/**
 * GET /api/review/stats
 * Returns review pipeline status statistics.
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Admin check (supports API key auth via Authorization header)
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return adminCheck.response;
  }

  try {
    // Check cache
    const cacheKey = cacheKeys.reviewStats();
    const cached = await getCached<ReviewStatsData>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          ...createRateLimitHeaders(rateLimitResult),
        },
      });
    }

    // Run pipeline stats and total reviews count in parallel
    const [statusCounts, totalReviews] = await Promise.all([
      skillReviewQueries.getPublicPipelineStats(db),
      skillReviewQueries.countTotalReviews(db),
    ]);

    // total_skills = sum of all statuses from pipeline query (browse-ready SKILL.md)
    const totalSkills = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

    const data: ReviewStatsData = {
      total_skills: totalSkills,
      ai_reviewed: statusCounts['ai-reviewed'] ?? 0,
      needs_re_review: statusCounts['needs-re-review'] ?? 0,
      total_reviews: totalReviews,
    };

    // Cache for 60 seconds
    await setCache(cacheKey, data, cacheTTL.reviewStats);

    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    console.error('[Review] Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch review stats' },
      { status: 500 }
    );
  }
}
