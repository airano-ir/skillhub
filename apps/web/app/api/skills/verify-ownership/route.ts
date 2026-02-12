import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Verify if the current user is the owner of a GitHub repository
 * GET /api/skills/verify-ownership?owner=...&repo=...
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.username) {
      return NextResponse.json(
        { error: 'Authentication required', isOwner: false },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'owner and repo parameters are required', isOwner: false },
        { status: 400 }
      );
    }

    // Get the GitHub username from session
    const username = session.user.username;

    // Check if user is the repo owner using public API
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SkillHub',
        },
      }
    );

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found', isOwner: false },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to verify repository', isOwner: false },
        { status: 500 }
      );
    }

    const repoData = await repoResponse.json();

    // Check if the user is the owner
    const isOwner = repoData.owner?.login?.toLowerCase() === username.toLowerCase();

    return NextResponse.json({
      isOwner,
      permission: isOwner ? 'owner' : 'none',
      username,
      repoOwner: repoData.owner?.login,
    });
  } catch (error) {
    console.error('Error verifying ownership:', error);
    return NextResponse.json(
      { error: 'Internal server error', isOwner: false },
      { status: 500 }
    );
  }
}
