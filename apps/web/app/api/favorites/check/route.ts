import { NextResponse, type NextRequest } from 'next/server';
import { createDb, userQueries, favoriteQueries } from '@skillhub/db';
import { auth } from '@/lib/auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { skillIds } = body;

    if (!Array.isArray(skillIds)) {
      return NextResponse.json({ error: 'skillIds must be an array' }, { status: 400 });
    }

    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ favorited: {} }, {
        headers: createRateLimitHeaders(rateLimitResult),
      });
    }

    const favoritedIds = await favoriteQueries.getFavoritedIds(db, dbUser.id, skillIds);
    const favorited: Record<string, boolean> = {};
    skillIds.forEach((id: string) => {
      favorited[id] = favoritedIds.includes(id);
    });

    return NextResponse.json({ favorited }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error checking favorites:', error);
    return NextResponse.json({ error: 'Failed to check favorites' }, { status: 500 });
  }
}
