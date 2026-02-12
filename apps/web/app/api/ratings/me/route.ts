import { NextResponse, type NextRequest } from 'next/server';
import { createDb, ratingQueries, userQueries } from '@skillhub/db';
import { auth } from '@/lib/auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

export async function GET(request: NextRequest) {
  // Rate limiting (authenticated)
  const rateLimitResult = await withRateLimit(request, 'authenticated');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const session = await auth();
    if (!session?.user?.githubId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skillId');

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    }

    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ rating: null }, {
        headers: createRateLimitHeaders(rateLimitResult),
      });
    }

    const rating = await ratingQueries.getUserRating(db, dbUser.id, skillId);
    return NextResponse.json({ rating }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error fetching user rating:', error);
    return NextResponse.json({ error: 'Failed to fetch rating' }, { status: 500 });
  }
}
