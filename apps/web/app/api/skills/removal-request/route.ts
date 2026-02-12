import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createDb, skillQueries, removalRequestQueries, userQueries } from '@skillhub/db';
import { sanitizeReason } from '@/lib/sanitize';
import { sendClaimSubmittedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const db = createDb();

/**
 * GET /api/skills/removal-request - Get user's removal requests
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.githubId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user from database
    const dbUser = await userQueries.getByGithubId(db, session.user.githubId);
    if (!dbUser) {
      return NextResponse.json({ requests: [] });
    }

    const requests = await removalRequestQueries.getByUser(db, dbUser.id);

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching removal requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/removal-request - Submit a removal request
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
    const { skillId, reason } = body;

    if (!skillId) {
      return NextResponse.json(
        { error: 'skillId is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // Check if skill exists
    const skill = await skillQueries.getById(db, skillId);
    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found', code: 'SKILL_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Get or create user in database
    let dbUser = await userQueries.getByGithubId(db, session.user.githubId);

    // Auto-create user if not in database (first API request after OAuth)
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

    // Check if user already has a pending request for this skill
    const hasPending = await removalRequestQueries.hasPendingRequest(
      db,
      dbUser.id,
      skillId
    );
    if (hasPending) {
      return NextResponse.json(
        { error: 'You already have a pending request for this skill', code: 'ALREADY_PENDING' },
        { status: 409 }
      );
    }

    // Verify ownership via GitHub API
    const owner = skill.githubOwner;
    const repo = skill.githubRepo;
    const username = session.user.username;

    // Check if skill has required GitHub info
    if (!owner || !repo) {
      console.error('Skill missing GitHub info:', { skillId, owner, repo });
      return NextResponse.json(
        { error: 'Skill does not have valid GitHub repository information', code: 'INVALID_SKILL' },
        { status: 400 }
      );
    }

    // Check repository ownership using public API (no token needed for public repos)
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
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        if (repoData.owner?.login?.toLowerCase() === username.toLowerCase()) {
          isOwner = true;
        }
      } else if (repoResponse.status === 404) {
        githubError = 'Repository not found on GitHub';
      } else if (repoResponse.status === 403) {
        githubError = 'GitHub API rate limit exceeded';
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

    // Create the removal request (auto-approved since owner is verified)
    const sanitizedReason = reason ? sanitizeReason(reason) : 'No reason provided';
    const requestId = await removalRequestQueries.create(db, {
      userId: dbUser.id,
      skillId,
      reason: sanitizedReason,
      verifiedOwner: true,
    });

    // Auto-approve: Block the skill from being re-indexed
    await skillQueries.block(db, skillId);

    // Update the request status to approved
    await removalRequestQueries.resolve(db, requestId, {
      status: 'approved',
      resolvedBy: dbUser.id,
      resolutionNote: 'Auto-approved: Owner verified via GitHub API',
    });

    // Send confirmation email (non-blocking)
    if (dbUser.email) {
      const locale = (dbUser.preferredLocale === 'fa' ? 'fa' : 'en') as 'en' | 'fa';
      sendClaimSubmittedEmail(dbUser.email, locale, 'remove', { skillId }).catch((err) => {
        console.error('[Claim] Failed to send removal confirmation email:', err);
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      message: 'Skill has been blocked from indexing',
      blocked: true,
    });
  } catch (error) {
    console.error('Error creating removal request:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
