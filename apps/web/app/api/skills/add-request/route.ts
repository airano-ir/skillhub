import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createDb, addRequestQueries, discoveredRepoQueries, userQueries } from '@skillhub/db';
import { sanitizeReason } from '@/lib/sanitize';
import { sendClaimSubmittedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const db = createDb();

// Parse GitHub URL to extract owner and repo
function parseGitHubUrl(url: string): { owner: string; repo: string; path?: string } | null {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('github.com')) {
      return null;
    }

    // Handle various GitHub URL formats:
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/main/path/to/skill
    // https://github.com/owner/repo/blob/main/SKILL.md
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      return null;
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    // Extract path if present (after tree/branch or blob/branch)
    let skillPath: string | undefined;
    if (pathParts.length > 3 && (pathParts[2] === 'tree' || pathParts[2] === 'blob')) {
      // Skip 'tree' or 'blob' and branch name
      const remainingPath = pathParts.slice(4).join('/');
      if (remainingPath && !remainingPath.endsWith('.md')) {
        skillPath = remainingPath;
      }
    }

    return { owner, repo, path: skillPath };
  } catch {
    return null;
  }
}

// Find all SKILL.md files in a repository using GitHub Tree API
async function findSkillMdFiles(
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<string[]> {
  try {
    // Get the full repository tree recursively
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SkillHub',
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!treeResponse.ok) {
      console.error(`Failed to fetch repository tree (HTTP ${treeResponse.status}):`, treeResponse.statusText);
      return [];
    }

    const treeData = await treeResponse.json() as {
      tree: Array<{ path: string; type: string }>;
      truncated?: boolean;
    };

    if (treeData.truncated) {
      console.warn(`Repository tree for ${owner}/${repo} is truncated - some SKILL.md files may be missed`);
    }

    // Find all SKILL.md files (case-sensitive)
    const skillMdPaths = treeData.tree
      .filter((item) => item.type === 'blob' && item.path.endsWith('/SKILL.md'))
      .map((item) => {
        // Extract the directory path (remove /SKILL.md)
        const parts = item.path.split('/');
        parts.pop(); // Remove SKILL.md
        return parts.join('/');
      });

    // Also check for SKILL.md at root level
    const hasRootSkillMd = treeData.tree.some(
      (item) => item.type === 'blob' && item.path === 'SKILL.md'
    );

    if (hasRootSkillMd) {
      skillMdPaths.unshift(''); // Empty string means root
    }

    return skillMdPaths;
  } catch (error) {
    console.error('Error finding SKILL.md files:', error);
    return [];
  }
}

// Validate GitHub repository exists and check for SKILL.md
async function validateGitHubRepo(
  owner: string,
  repo: string,
  skillPath?: string
): Promise<{
  valid: boolean;
  hasSkillMd: boolean;
  skillPaths: string[];
  defaultBranch: string;
  error?: string;
}> {
  try {
    // Check if repository exists and get default branch
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SkillHub',
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return {
          valid: false,
          hasSkillMd: false,
          skillPaths: [],
          defaultBranch: 'main',
          error: 'Repository not found. Please check the URL and ensure the repository exists.'
        };
      }
      if (repoResponse.status === 403) {
        // Check if it's rate limit or forbidden access
        const rateLimitRemaining = repoResponse.headers.get('x-ratelimit-remaining');
        if (rateLimitRemaining === '0') {
          return {
            valid: false,
            hasSkillMd: false,
            skillPaths: [],
            defaultBranch: 'main',
            error: 'GitHub API rate limit exceeded. Please try again later.'
          };
        }
        return {
          valid: false,
          hasSkillMd: false,
          skillPaths: [],
          defaultBranch: 'main',
          error: 'Repository is private or you do not have access. Please ensure the repository is public.'
        };
      }
      return {
        valid: false,
        hasSkillMd: false,
        skillPaths: [],
        defaultBranch: 'main',
        error: `Failed to access repository (HTTP ${repoResponse.status})`
      };
    }

    const repoData = await repoResponse.json() as { default_branch: string; private?: boolean };
    const defaultBranch = repoData.default_branch || 'main';

    // Additional check for private repos (in case 200 but private)
    if (repoData.private) {
      return {
        valid: false,
        hasSkillMd: false,
        skillPaths: [],
        defaultBranch,
        error: 'Repository is private. SkillHub only indexes public repositories.'
      };
    }

    // If a specific path is provided, only check that path
    if (skillPath) {
      const skillMdPath = `${skillPath}/SKILL.md`;
      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${skillMdPath}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'SkillHub',
            ...(process.env.GITHUB_TOKEN && {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            }),
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      const hasSkillMd = fileResponse.ok;
      return {
        valid: true,
        hasSkillMd,
        skillPaths: hasSkillMd ? [skillPath] : [],
        defaultBranch,
      };
    }

    // No specific path - do a deep scan for all SKILL.md files
    const skillPaths = await findSkillMdFiles(owner, repo, defaultBranch);

    return {
      valid: true,
      hasSkillMd: skillPaths.length > 0,
      skillPaths,
      defaultBranch,
    };
  } catch (error) {
    console.error('GitHub API error:', error);

    // Distinguish timeout errors
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        valid: false,
        hasSkillMd: false,
        skillPaths: [],
        defaultBranch: 'main',
        error: 'Request timed out while checking repository. Please try again.'
      };
    }

    return {
      valid: false,
      hasSkillMd: false,
      skillPaths: [],
      defaultBranch: 'main',
      error: 'Network error while verifying repository. Please check your connection and try again.'
    };
  }
}

/**
 * GET /api/skills/add-request - Get user's add requests
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

    const requests = await addRequestQueries.getByUser(db, dbUser.id);

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching add requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/add-request - Submit an add request
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
    const { repositoryUrl, reason } = body;

    if (!repositoryUrl) {
      return NextResponse.json(
        { error: 'repositoryUrl is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // Parse GitHub URL
    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL', code: 'INVALID_URL' },
        { status: 400 }
      );
    }

    // Normalize the repository URL
    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
    const finalSkillPath = undefined;

    // Get or create user in database
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

    // Check if user already has a pending request for this repository + path combination
    const hasPending = await addRequestQueries.hasPendingRequest(
      db,
      dbUser.id,
      normalizedUrl,
      finalSkillPath || null
    );
    if (hasPending) {
      return NextResponse.json(
        { error: 'You already have a pending request for this skill path', code: 'ALREADY_PENDING' },
        { status: 409 }
      );
    }

    // Validate the GitHub repository
    const validation = await validateGitHubRepo(parsed.owner, parsed.repo, finalSkillPath);

    if (!validation.valid) {
      let errorCode = 'INVALID_REPO';

      // Map specific error messages to error codes
      if (validation.error?.includes('rate limit')) {
        errorCode = 'RATE_LIMIT_EXCEEDED';
      } else if (validation.error?.includes('not found')) {
        errorCode = 'INVALID_REPO';
      } else if (validation.error?.includes('timeout') || validation.error?.includes('timed out')) {
        errorCode = 'NETWORK_TIMEOUT';
      }

      return NextResponse.json(
        { error: validation.error || 'Invalid repository', code: errorCode },
        { status: 400 }
      );
    }

    // Create the add request with found skill paths
    const skillPathsJson = validation.skillPaths.length > 0
      ? validation.skillPaths.join(',')
      : undefined;

    // Sanitize user-provided reason
    const sanitizedReason = reason ? sanitizeReason(reason) : 'No reason provided';

    const requestId = await addRequestQueries.create(db, {
      userId: dbUser.id,
      repositoryUrl: normalizedUrl,
      skillPath: skillPathsJson,
      reason: sanitizedReason,
      validRepo: validation.valid,
      hasSkillMd: validation.hasSkillMd,
    });

    // Auto-approve and queue for crawling if SKILL.md found
    if (validation.hasSkillMd && validation.skillPaths.length > 0) {
      await addRequestQueries.updateStatus(db, requestId, {
        status: 'approved',
      });

      // Queue repo for indexer crawling via discovered_repos
      try {
        await discoveredRepoQueries.upsert(db, {
          id: `${parsed.owner}/${parsed.repo}`,
          owner: parsed.owner,
          repo: parsed.repo,
          discoveredVia: 'add-request',
          githubStars: 0,
        });
      } catch (err) {
        console.warn('[Claim] Failed to queue repo for crawling:', err);
      }
    }

    // Build appropriate response message
    let message: string;
    if (validation.skillPaths.length > 1) {
      message = `Request submitted. Found ${validation.skillPaths.length} skills in the repository.`;
    } else if (validation.skillPaths.length === 1) {
      const pathInfo = validation.skillPaths[0] === '' ? 'at root' : `in ${validation.skillPaths[0]}`;
      message = `Request submitted. SKILL.md found ${pathInfo}.`;
    } else {
      message = 'Request submitted. No SKILL.md found - repository will be reviewed.';
    }

    // Send confirmation email (non-blocking) - ONLY if skills were found
    if (dbUser.email && validation.skillPaths.length > 0) {
      const locale = (dbUser.preferredLocale === 'fa' ? 'fa' : 'en') as 'en' | 'fa';
      sendClaimSubmittedEmail(dbUser.email, locale, 'add', {
        repositoryUrl: normalizedUrl,
        skillCount: validation.skillPaths.length,
      }).catch((err) => {
        console.error('[Claim] Failed to send add confirmation email:', err);
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      hasSkillMd: validation.hasSkillMd,
      skillCount: validation.skillPaths.length,
      skillPaths: validation.skillPaths,
      message,
    });
  } catch (error) {
    console.error('Error creating add request:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
