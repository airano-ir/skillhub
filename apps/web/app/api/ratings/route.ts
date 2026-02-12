import { NextResponse, type NextRequest } from 'next/server';
import { createDb, ratingQueries, skillQueries, userQueries } from '@skillhub/db';
import { auth } from '@/lib/auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeReview } from '@/lib/sanitize';

const db = createDb();

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skillId');

    // Parse and validate pagination parameters
    const limitRaw = parseInt(searchParams.get('limit') || '10');
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 10 : Math.min(limitRaw, 100);

    const offsetRaw = parseInt(searchParams.get('offset') || '0');
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    }

    const ratings = await ratingQueries.getForSkill(db, skillId, limit, offset);
    const skill = await skillQueries.getById(db, skillId);

    return NextResponse.json({
      ratings: ratings.map((r) => ({
        id: r.rating.id,
        rating: r.rating.rating,
        review: r.rating.review,
        createdAt: r.rating.createdAt,
        updatedAt: r.rating.updatedAt,
        user: {
          id: r.user.id,
          username: r.user.username,
          avatarUrl: r.user.avatarUrl,
        },
      })),
      summary: {
        average: skill?.rating || 0,
        count: skill?.ratingCount || 0,
      },
    }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting (authenticated tier for POST)
  const rateLimitResult = await withRateLimit(request, 'authenticated');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const session = await auth();
    if (!session?.user?.githubId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { skillId, rating, review } = body;

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    }

    // Validate rating
    const ratingValue = parseInt(rating);
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Get database user ID
    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify skill exists
    const skill = await skillQueries.getById(db, skillId);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    // Upsert rating with sanitized review
    const result = await ratingQueries.upsert(db, {
      skillId,
      userId: dbUser.id,
      rating: ratingValue,
      review: sanitizeReview(review) ?? undefined,
    });

    // Get updated skill aggregates
    const updatedSkill = await skillQueries.getById(db, skillId);

    return NextResponse.json({
      rating: result,
      summary: {
        average: updatedSkill?.rating || 0,
        count: updatedSkill?.ratingCount || 0,
      },
    }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error creating rating:', error);
    return NextResponse.json({ error: 'Failed to create rating' }, { status: 500 });
  }
}
