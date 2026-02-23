import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skillReviewQueries } from '@skillhub/db';
import { requireAdmin } from '@/lib/admin-auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { getCached, setCache, cacheKeys, cacheTTL } from '@/lib/cache';

const db = createDb();

interface ReviewStatsData {
  unreviewed: number;
  auto_scored: number;
  ai_reviewed: number;
  verified: number;
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

    // Run stats and total reviews count in parallel
    const [statusCounts, totalReviews] = await Promise.all([
      skillReviewQueries.getStats(db),
      skillReviewQueries.countTotalReviews(db),
    ]);

    const data: ReviewStatsData = {
      unreviewed: statusCounts['unreviewed'] ?? 0,
      auto_scored: statusCounts['auto-scored'] ?? 0,
      ai_reviewed: statusCounts['ai-reviewed'] ?? 0,
      verified: statusCounts['verified'] ?? 0,
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
