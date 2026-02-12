import { NextResponse, type NextRequest } from 'next/server';
import { createDb, userQueries, favoriteQueries, skillQueries } from '@skillhub/db';
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

    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ favorites: [] }, {
        headers: createRateLimitHeaders(rateLimitResult),
      });
    }

    const favorites = await userQueries.getFavorites(db, dbUser.id);
    return NextResponse.json({
      favorites: favorites.map((f) => ({
        id: f.skill.id,
        name: f.skill.name,
        description: f.skill.description,
        githubOwner: f.skill.githubOwner,
        githubRepo: f.skill.githubRepo,
        githubStars: f.skill.githubStars,
        downloadCount: f.skill.downloadCount,
        securityStatus: f.skill.securityStatus,
        isVerified: f.skill.isVerified,
        compatibility: f.skill.compatibility,
        rating: f.skill.rating,
        ratingCount: f.skill.ratingCount,
      })),
    }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

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
    const { skillId } = body;

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    }

    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify skill exists
    const skill = await skillQueries.getById(db, skillId);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    await favoriteQueries.add(db, dbUser.id, skillId);
    return NextResponse.json({ success: true, favorited: true }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
    const { skillId } = body;

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    }

    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await favoriteQueries.remove(db, dbUser.id, skillId);
    return NextResponse.json({ success: true, favorited: false }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
