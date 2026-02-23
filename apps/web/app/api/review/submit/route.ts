import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skillReviewQueries } from '@skillhub/db';
import { requireAdmin } from '@/lib/admin-auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 60; // seconds — batch DB writes can be slow

const db = createDb();

interface ReviewItem {
  skill_id: string;
  ai_score?: number;
  instruction_quality?: number;
  description_precision?: number;
  usefulness?: number;
  technical_soundness?: number;
  review_notes?: string;
  suggested_categories?: string[];
  blog_worthy?: boolean;
  collection_candidate?: string | null;
  needs_improvement?: string | null;
  i18n_priority?: number;
  content_hash_at_review?: string;
  set_verified?: boolean;
}

function validateReviews(body: unknown): { reviews: ReviewItem[] } | { error: string } {
  if (!body || typeof body !== 'object' || !('reviews' in body)) {
    return { error: 'Missing "reviews" array in request body' };
  }

  const { reviews } = body as { reviews: unknown };
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { error: '"reviews" must be a non-empty array' };
  }
  if (reviews.length > 50) {
    return { error: '"reviews" array cannot exceed 50 items' };
  }

  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    if (!r || typeof r !== 'object') {
      return { error: `reviews[${i}] is not an object` };
    }
    const item = r as Record<string, unknown>;
    if (typeof item.skill_id !== 'string' || item.skill_id.length === 0) {
      return { error: `reviews[${i}].skill_id is required and must be a non-empty string` };
    }
    // Validate score fields (0-100 integers, optional)
    for (const field of ['ai_score', 'instruction_quality', 'description_precision', 'usefulness', 'technical_soundness']) {
      if (item[field] !== undefined && item[field] !== null) {
        if (typeof item[field] !== 'number' || !Number.isInteger(item[field]) || (item[field] as number) < 0 || (item[field] as number) > 100) {
          return { error: `reviews[${i}].${field} must be an integer 0-100` };
        }
      }
    }
    // Validate i18n_priority (0-2)
    if (item.i18n_priority !== undefined && item.i18n_priority !== null) {
      if (typeof item.i18n_priority !== 'number' || !Number.isInteger(item.i18n_priority) || item.i18n_priority < 0 || item.i18n_priority > 2) {
        return { error: `reviews[${i}].i18n_priority must be an integer 0-2` };
      }
    }
  }

  return { reviews: reviews as ReviewItem[] };
}

/**
 * POST /api/review/submit
 * Submit AI review results for a batch of skills.
 */
export async function POST(request: NextRequest) {
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

  // Primary server check
  const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
  if (!isPrimary) {
    return NextResponse.json(
      { error: 'Write operations only on primary server' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const result = validateReviews(body);
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    const { reviews } = result;

    // Insert review rows
    const dbReviews = reviews.map((r) => ({
      skillId: r.skill_id,
      reviewer: 'claude-code' as const,
      aiScore: r.ai_score,
      instructionQuality: r.instruction_quality,
      descriptionPrecision: r.description_precision,
      usefulness: r.usefulness,
      technicalSoundness: r.technical_soundness,
      reviewNotes: r.review_notes,
      suggestedCategories: r.suggested_categories,
      blogWorthy: r.blog_worthy,
      collectionCandidate: r.collection_candidate ?? undefined,
      needsImprovement: r.needs_improvement ?? undefined,
      i18nPriority: r.i18n_priority,
      contentHashAtReview: r.content_hash_at_review,
    }));

    await skillReviewQueries.createBatch(db, dbReviews);

    // Update review_status on each skill
    let verifiedCount = 0;
    for (const r of reviews) {
      const newStatus = r.set_verified ? 'verified' : 'ai-reviewed';
      if (r.set_verified) verifiedCount++;

      await skillReviewQueries.updateSkillReviewStatus(db, r.skill_id, newStatus);
    }

    return NextResponse.json(
      {
        submitted: reviews.length,
        verified: verifiedCount,
      },
      {
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  } catch (error) {
    console.error('[Review] Error submitting reviews:', error);
    return NextResponse.json(
      { error: 'Failed to submit reviews' },
      { status: 500 }
    );
  }
}
