import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createDb, skillQueries, discoveredRepoQueries, userQueries } from '@skillhub/db';
import { sanitizeReason } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

const db = createDb();

function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  try {
    if (input.startsWith('https://') || input.startsWith('http://')) {
      const url = new URL(input);
      if (!url.hostname.includes('github.com')) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      return { owner: parts[0], repo: parts[1] };
    }
    const parts = input.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/**
 * POST /api/skills/repo-removal-request
 * Block all skills from a GitHub repository at once.
 * Verifies the authenticated user owns the repo, then blocks all skills and
 * prevents the repo from being re-indexed.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.githubId || !session.user.username) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { repoUrl, reason } = body;

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'repoUrl is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const parsed = parseOwnerRepo(String(repoUrl).trim());
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid format. Use https://github.com/owner/repo or owner/repo', code: 'PARSE_ERROR' },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;
    const username = session.user.username;

    // Get or create user
    let dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      dbUser = await userQueries.upsertFromGithub(db, {
        githubId: session.user.githubId,
        username: session.user.username,
        displayName: session.user.name || undefined,
        email: session.user.email || undefined,
        avatarUrl: session.user.image || undefined,
      });
    }
    if (!dbUser) {
      return NextResponse.json(
        { error: 'Failed to create user record', code: 'USER_CREATE_FAILED' },
        { status: 500 }
      );
    }

    // Verify repo ownership via GitHub API
    let isOwner = false;
    let githubError: string | null = null;

    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'SkillHub',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        if (repoData.owner?.login?.toLowerCase() === username.toLowerCase()) {
          isOwner = true;
        }
      } else if (repoResponse.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found on GitHub', code: 'INVALID_REPO' },
          { status: 404 }
        );
      } else if (repoResponse.status === 403) {
        githubError = 'GitHub API rate limit exceeded. Please try again later.';
      }
    } catch (fetchError) {
      console.error('GitHub API fetch error:', fetchError);
      githubError = 'Failed to verify repository ownership';
    }

    if (githubError) {
      return NextResponse.json(
        { error: githubError, code: 'GITHUB_ERROR' },
        { status: 502 }
      );
    }

    if (!isOwner) {
      return NextResponse.json(
        { error: 'You are not the owner of this repository', code: 'NOT_OWNER' },
        { status: 403 }
      );
    }

    // Count skills before blocking (for response message)
    const blockedCount = await skillQueries.countByRepo(db, owner, repo);

    // Block all skills from the repo
    await skillQueries.blockByRepo(db, owner, repo);

    // Block the discovered_repo entry to prevent re-indexing
    await discoveredRepoQueries.blockRepo(db, `${owner}/${repo}`);

    const sanitizedReason = reason ? sanitizeReason(String(reason)) : undefined;
    console.log(
      `[RepoRemoval] ${username} removed ${owner}/${repo} (${blockedCount} skills blocked)${sanitizedReason ? ` — ${sanitizedReason}` : ''}`
    );

    return NextResponse.json({
      success: true,
      blockedCount,
      repo: `${owner}/${repo}`,
    });
  } catch (error) {
    console.error('Error processing repo removal request:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
