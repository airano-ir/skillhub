import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skillReviewQueries } from '@skillhub/db';
import { requireAdmin } from '@/lib/admin-auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 60; // seconds — queries 55K+ skills with owner-cap logic

const db = createDb();

/**
 * GET /api/review/pending
 * Returns a batch of skills ready for AI review.
 * Supports owner-capped batches for diversity and hybrid re-review/new-review mixing.
 *
 * Query params:
 *   batch_size      - number of skills to return (default 20, max 50)
 *   offset          - number of skills to skip for pagination (default 0)
 *   min_quality     - minimum quality_score (default 50)
 *   security        - security_status filter (default "pass")
 *   priority        - "re-review" to show needs-re-review first, "re-review-all" to include already ai-reviewed skills
 *   owner_limit     - max skills per github_owner in batch (default 0=unlimited, max 10)
 *   sort_by         - sort order: "quality" (default), "stars", "downloads"
 *   min_ai_score    - minimum latestAiScore filter (for targeted re-review)
 *   max_ai_score    - maximum latestAiScore filter (for targeted re-review)
 *   reviewed_before - ISO date string, only include skills reviewed before this date
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
    const { searchParams } = new URL(request.url);
    const batchSize = Math.min(
      Math.max(parseInt(searchParams.get('batch_size') ?? '20', 10) || 20, 1),
      50
    );
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);
    const minQuality = parseInt(searchParams.get('min_quality') ?? '50', 10) || 50;
    const securityPass = searchParams.get('security') !== 'any';
    const priorityParam = searchParams.get('priority') ?? '';
    const priorityReReview = priorityParam === 're-review';
    const reReviewAll = priorityParam === 're-review-all';
    const ownerLimit = Math.min(
      Math.max(parseInt(searchParams.get('owner_limit') ?? '0', 10) || 0, 0),
      10
    );
    const currentReviewVersion = Math.max(
      parseInt(searchParams.get('review_version') ?? '0', 10) || 0, 0
    );
    const sortBy = (['quality', 'stars', 'downloads'] as const).includes(
      searchParams.get('sort_by') as 'quality' | 'stars' | 'downloads'
    ) ? (searchParams.get('sort_by') as 'quality' | 'stars' | 'downloads') : 'quality';
    const minAiScoreParam = searchParams.get('min_ai_score');
    const minAiScore = minAiScoreParam ? parseInt(minAiScoreParam, 10) : undefined;
    const maxAiScoreParam = searchParams.get('max_ai_score');
    const maxAiScore = maxAiScoreParam ? parseInt(maxAiScoreParam, 10) : undefined;
    const reviewedBefore = searchParams.get('reviewed_before') || undefined;

    // Run counts in parallel
    const [totalPending, reReviews] = await Promise.all([
      skillReviewQueries.countPending(db, { minQuality, securityPass }),
      skillReviewQueries.countReReviews(db),
    ]);

    // Re-review-all mode: skip hybrid mixing, just fetch all reviewable skills
    let batch: Array<{ id: string; githubOwner?: string; github_owner?: string; [key: string]: unknown }> = [];

    if (reReviewAll) {
      const extraSlots = ownerLimit > 0 ? Math.min(batchSize, 10) : 0;
      const allBatch = await skillReviewQueries.getPending(db, {
        batchSize: batchSize + extraSlots,
        offset,
        minQuality,
        securityPass,
        reReviewAll: true,
        ownerLimit,
        currentReviewVersion,
        sortBy,
        minAiScore,
        maxAiScore,
        reviewedBefore,
      }) as typeof batch;
      batch = [...allBatch].slice(0, batchSize);
    } else {
      // Normal mode: Hybrid batch — mix re-reviews (up to 5) with new reviews
      const reReviewSlots = Math.min(5, reReviews, batchSize);

      if (reReviewSlots > 0 && !priorityReReview) {
        // Fetch re-reviews first (up to 5)
        const reReviewBatch = await skillReviewQueries.getPending(db, {
          batchSize: reReviewSlots,
          minQuality: 0, // re-reviews regardless of quality
          securityPass,
          priorityReReview: true,
          ownerLimit,
          sortBy,
        });
        batch = [...reReviewBatch] as typeof batch;
      }

      // Fill remaining slots with new reviews (or all slots if priority=re-review)
      const remainingSlots = batchSize - batch.length;
      if (remainingSlots > 0) {
        // Request extra to compensate for owner deduplication
        const extraSlots = ownerLimit > 0 ? Math.min(remainingSlots, 10) : 0;
        const newBatch = await skillReviewQueries.getPending(db, {
          batchSize: priorityReReview ? batchSize : (remainingSlots + extraSlots),
          offset,
          minQuality,
          securityPass,
          priorityReReview,
          ownerLimit,
          sortBy,
        }) as typeof batch;

        if (priorityReReview) {
          batch = [...newBatch];
        } else if (ownerLimit > 0 && batch.length > 0) {
          // Deduplicate owners: count per-owner across both batches
          const ownerCounts: Record<string, number> = {};
          for (const s of batch) {
            const owner = (s.githubOwner ?? s.github_owner ?? 'unknown') as string;
            ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
          }
          for (const s of newBatch) {
            const owner = (s.githubOwner ?? s.github_owner ?? 'unknown') as string;
            if ((ownerCounts[owner] || 0) >= ownerLimit) continue; // Skip — owner already at cap
            ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
            batch.push(s);
            if (batch.length >= batchSize) break;
          }
        } else {
          batch = [...batch, ...newBatch].slice(0, batchSize);
        }
      }
    }

    return NextResponse.json(
      {
        total_pending: totalPending,
        re_reviews: reReviews,
        batch,
      },
      {
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  } catch (error) {
    console.error('[Review] Error fetching pending:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending reviews' },
      { status: 500 }
    );
  }
}
