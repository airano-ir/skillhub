import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries } from '@skillhub/db';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { getGitHubHeaders, updateTokenStats } from '@/lib/github-token-manager';

// Route configuration for longer timeout (skills with many files)
export const maxDuration = 60; // 60 seconds

// Maximum recursion depth to prevent infinite loops
const MAX_DEPTH = 5;

// Fetch timeout in milliseconds
const FETCH_TIMEOUT = 30000; // 30 seconds

// Create database connection
const db = createDb();

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
}

interface SkillFile {
  name: string;
  path: string;
  content: string;
  size: number;
  isBinary: boolean;
}

interface CachedFiles {
  fetchedAt: string;
  commitSha: string;
  totalSize: number;
  items: SkillFile[];
}

/**
 * GET /api/skill-files?id=anthropics/skills/pdf
 * Returns all files in a skill folder, using cache when available
 *
 * Flow:
 * 1. Check if cached files exist in database
 * 2. If cache is valid (commitSha matches), return from cache (FAST)
 * 3. If cache is stale or missing, fetch from GitHub
 * 4. Save to cache for future requests
 * 5. Return files
 */
export async function GET(request: NextRequest) {
  // Rate limiting (use search tier as this is an expensive operation)
  const rateLimitResult = await withRateLimit(request, 'search');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const skillId = request.nextUrl.searchParams.get('id');

    if (!skillId) {
      return NextResponse.json(
        { error: 'Missing skill ID parameter', code: 'MISSING_ID' },
        { status: 400 }
      );
    }

    // Get skill from database
    const skill = await skillQueries.getById(db, skillId);

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const { githubOwner, githubRepo, skillPath, branch, commitSha, sourceFormat } = skill;

    // === CACHE CHECK ===
    // Try to get cached files first (this is the fast path)
    const cachedFiles = await skillQueries.getCachedFiles(db, skillId);

    if (cachedFiles) {
      // eslint-disable-next-line no-console
      console.log(`[skill-files] Cache HIT for ${skillId}`);

      // Note: Download count is NOT incremented here.
      // It should only be incremented in /api/skills/install after successful download.
      // This endpoint is just for fetching files - the download may still fail
      // (e.g., if JSZip fails to load from CDN).

      return NextResponse.json({
        skillId,
        githubOwner,
        githubRepo,
        skillPath,
        branch: branch || 'main',
        sourceFormat: sourceFormat || 'skill.md',
        files: cachedFiles.items.map(item => ({
          name: item.name,
          path: item.path,
          type: 'file' as const,
          size: item.size,
          content: item.isBinary ? undefined : item.content,
          downloadUrl: item.isBinary ? `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${branch || 'main'}/${skillPath}/${item.path}` : undefined,
        })),
        fromCache: true,
        cachedAt: cachedFiles.fetchedAt,
      }, {
        headers: createRateLimitHeaders(rateLimitResult),
      });
    }

    // === CACHE MISS - Fetch from GitHub ===
    // eslint-disable-next-line no-console
    console.log(`[skill-files] Cache MISS for ${skillId}, fetching from GitHub...`);

    // Get GitHub headers with token rotation
    const { headers: githubHeaders, token } = await getGitHubHeaders();

    // Warn if no GitHub token (limited to 60 req/hr)
    if (!token) {
      console.warn('No GITHUB_TOKEN configured - limited to 60 requests/hour');
    }

    // Fetch skill folder contents from GitHub
    const files = await fetchSkillFiles(
      githubOwner,
      githubRepo,
      skillPath,
      branch || 'main',
      0, // Start at depth 0
      githubHeaders,
      token
    );

    // === SAVE TO CACHE ===
    // Prepare cached files structure
    const filesToCache: CachedFiles = {
      fetchedAt: new Date().toISOString(),
      commitSha: commitSha || 'unknown',
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      items: files,
    };

    // Save to database (async, don't block response)
    skillQueries.updateCachedFiles(db, skillId, filesToCache).catch((err) => {
      console.error(`[skill-files] Failed to cache files for ${skillId}:`, err);
    });

    // Note: Download count is NOT incremented here.
    // It should only be incremented in /api/skills/install after successful download.

    // Return response with files
    return NextResponse.json({
      skillId,
      githubOwner,
      githubRepo,
      skillPath,
      branch: branch || 'main',
      sourceFormat: sourceFormat || 'skill.md',
      files: files.map(item => ({
        name: item.name,
        path: item.path,
        type: 'file' as const,
        size: item.size,
        content: item.isBinary ? undefined : item.content,
        downloadUrl: item.isBinary ? `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${branch || 'main'}/${skillPath}/${item.path}` : undefined,
      })),
      fromCache: false,
    }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error('Error fetching skill files:', error);

    // Return specific error codes for different failure types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
      return NextResponse.json(
        { error: 'GitHub API rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' },
        { status: 429 }
      );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return NextResponse.json(
        { error: 'Request timed out. The skill may have too many files.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }

    if (errorMessage.includes('404')) {
      return NextResponse.json(
        { error: 'Skill files not found on GitHub', code: 'GITHUB_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch skill files', code: 'FETCH_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * Recursively fetch all files in a skill folder from GitHub
 * @param depth - Current recursion depth (max MAX_DEPTH levels)
 * @param headers - GitHub API headers (with token rotation)
 * @param token - Current token for stats tracking
 */
async function fetchSkillFiles(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  depth: number = 0,
  headers: Record<string, string>,
  token: string | null
): Promise<SkillFile[]> {
  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    console.warn(`Max depth (${MAX_DEPTH}) reached at: ${path}`);
    return [];
  }

  const files: SkillFile[] = [];

  // Fetch directory contents with timeout
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
  const response = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  // Update token stats for rotation
  if (token) {
    await updateTokenStats(token, response.headers);
  }

  if (!response.ok) {
    // Check for rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded');
      }
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const contents: GitHubFile[] = await response.json();

  // Process each item
  for (const item of contents) {
    if (item.type === 'file') {
      // Determine if file is binary
      const isBinary = !isTextFile(item.name);

      if (!isBinary && item.size < 1024 * 1024) {
        // For text files (< 1MB), fetch content
        try {
          const content = await fetchFileContent(owner, repo, item.path, ref, headers, token);
          files.push({
            name: item.name,
            path: item.path.replace(`${path}/`, '').replace(path, '') || item.name,
            content,
            size: item.size,
            isBinary: false,
          });
        } catch {
          // If content fetch fails, mark as binary (will use download URL)
          files.push({
            name: item.name,
            path: item.path.replace(`${path}/`, '').replace(path, '') || item.name,
            content: '',
            size: item.size,
            isBinary: true,
          });
        }
      } else {
        // For binary or large files, don't store content (use download URL)
        files.push({
          name: item.name,
          path: item.path.replace(`${path}/`, '').replace(path, '') || item.name,
          content: '',
          size: item.size,
          isBinary: true,
        });
      }
    } else if (item.type === 'dir') {
      // Recursively fetch subdirectory (with depth limit)
      const subPath = `${path}/${item.name}`;
      const subFiles = await fetchSkillFiles(owner, repo, subPath, ref, depth + 1, headers, token);

      // Add subdirectory files with proper paths
      for (const subFile of subFiles) {
        files.push({
          ...subFile,
          path: `${item.name}/${subFile.path}`,
        });
      }
    }
  }

  return files;
}

/**
 * Fetch file content from GitHub with timeout
 */
async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  headers: Record<string, string>,
  token: string | null
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
  const response = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  // Update token stats for rotation
  if (token) {
    await updateTokenStats(token, response.headers);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${path} (${response.status})`);
  }

  const data = await response.json();

  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  throw new Error(`Invalid file content for: ${path}`);
}

/**
 * Check if file is a text file based on extension
 * Note: .env files are excluded for security (could contain secrets)
 */
/**
 * Known instruction file names that are always plain text
 */
const KNOWN_TEXT_FILENAMES = ['SKILL.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', 'copilot-instructions.md'];

function isTextFile(filename: string): boolean {
  // Exclude potentially sensitive files
  const sensitivePatterns = ['.env', '.secret', '.key', '.pem', '.credential'];
  const lowerFilename = filename.toLowerCase();
  if (sensitivePatterns.some((p) => lowerFilename.includes(p))) {
    return false;
  }

  // Known instruction dotfiles that are plain text
  if (KNOWN_TEXT_FILENAMES.includes(filename)) {
    return true;
  }

  const textExtensions = [
    '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css',
    '.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.bash', '.ps1',
    '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
    '.toml', '.ini', '.cfg', '.conf', '.gitignore', '.editorconfig',
  ];

  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return textExtensions.includes(ext) || !filename.includes('.');
}
