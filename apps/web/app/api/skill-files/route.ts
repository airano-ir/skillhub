import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries } from '@skillhub/db';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { getGitHubHeaders, updateTokenStats } from '@/lib/github-token-manager';

// Route configuration for longer timeout (skills with many files)
export const maxDuration = 60; // 60 seconds

// Maximum recursion depth to prevent infinite loops
const MAX_DEPTH = 5;

// Maximum number of files to fetch per skill
const MAX_FILES = 50;

// Maximum total content size (2MB) to prevent huge responses
const MAX_TOTAL_SIZE = 2 * 1024 * 1024;

// Concurrency limit for parallel file content fetches
const PARALLEL_FETCH_LIMIT = 5;

// Fetch timeout in milliseconds
const FETCH_TIMEOUT = 15000; // 15 seconds per individual fetch

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
  fetchFailed?: boolean;
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
    const { files, fetchFailureCount } = await fetchSkillFiles(
      githubOwner,
      githubRepo,
      skillPath,
      branch || 'main',
      0, // Start at depth 0
      githubHeaders,
      token
    );

    // === SAVE TO CACHE (only if all files fetched successfully) ===
    if (fetchFailureCount > 0) {
      console.warn(`[skill-files] Skipping cache for ${skillId}: ${fetchFailureCount} file(s) failed to fetch`);
    } else {
      const filesToCache: CachedFiles = {
        fetchedAt: new Date().toISOString(),
        commitSha: commitSha || 'unknown',
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        items: files.map(({ fetchFailed: _, ...rest }) => rest),
      };

      // Save to database (async, don't block response)
      skillQueries.updateCachedFiles(db, skillId, filesToCache).catch((err) => {
        console.error(`[skill-files] Failed to cache files for ${skillId}:`, err);
      });
    }

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
      ...(fetchFailureCount > 0 ? { fetchFailures: fetchFailureCount } : {}),
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
      // Increment stale check (non-blocking) — after 3 consecutive 404s, skill is marked stale
      const skillId404 = request.nextUrl.searchParams.get('id');
      if (skillId404) {
        skillQueries.incrementStaleCheck(db, skillId404).catch((err) => {
          console.error(`[skill-files] Failed to increment stale check for ${skillId404}:`, err);
        });
      }

      // If we have cached files in DB, serve them with stale warning instead of 404
      if (skillId404) {
        const skill404 = await skillQueries.getById(db, skillId404);
        if (skill404?.cachedFiles) {
          const cached = skill404.cachedFiles as CachedFiles;
          return NextResponse.json({
            skillId: skillId404,
            githubOwner: skill404.githubOwner,
            githubRepo: skill404.githubRepo,
            skillPath: skill404.skillPath,
            branch: skill404.branch || 'main',
            sourceFormat: skill404.sourceFormat || 'skill.md',
            files: cached.items.map(item => ({
              name: item.name,
              path: item.path,
              type: 'file' as const,
              size: item.size,
              content: item.isBinary ? undefined : item.content,
              downloadUrl: item.isBinary ? `https://raw.githubusercontent.com/${skill404.githubOwner}/${skill404.githubRepo}/${skill404.branch || 'main'}/${skill404.skillPath}/${item.path}` : undefined,
            })),
            fromCache: true,
            cachedAt: cached.fetchedAt,
            isStale: true,
            staleWarning: 'This skill may have been removed from GitHub. Files served from cache.',
          }, {
            headers: createRateLimitHeaders(rateLimitResult),
          });
        }
      }

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
 * Helper: run async tasks with concurrency limit
 */
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function runNext(): Promise<void> {
    while (idx < tasks.length) {
      const currentIdx = idx++;
      results[currentIdx] = await tasks[currentIdx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

/**
 * Recursively collect file metadata (directory listings only, no content fetch).
 * Returns flat list of file entries to fetch content for.
 */
async function collectFileEntries(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  depth: number,
  headers: Record<string, string>,
  token: string | null
): Promise<Array<{ item: GitHubFile; relativePath: string }>> {
  if (depth > MAX_DEPTH) {
    console.warn(`Max depth (${MAX_DEPTH}) reached at: ${path}`);
    return [];
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
  const response = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (token) {
    await updateTokenStats(token, response.headers);
  }

  if (!response.ok) {
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded');
      }
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const contents: GitHubFile[] = await response.json();
  const entries: Array<{ item: GitHubFile; relativePath: string }> = [];

  for (const item of contents) {
    const relativePath = item.path.replace(`${path}/`, '').replace(path, '') || item.name;

    if (item.type === 'file') {
      entries.push({ item, relativePath });
    } else if (item.type === 'dir') {
      const subEntries = await collectFileEntries(
        owner, repo, `${path}/${item.name}`, ref, depth + 1, headers, token
      );
      for (const sub of subEntries) {
        entries.push({
          item: sub.item,
          relativePath: `${item.name}/${sub.relativePath}`,
        });
      }
    }
  }

  return entries;
}

/**
 * Fetch all files in a skill folder from GitHub.
 * Phase 1: Collect directory tree (sequential, required for recursion)
 * Phase 2: Fetch file contents in parallel (fast, with concurrency limit)
 */
async function fetchSkillFiles(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  depth: number = 0,
  headers: Record<string, string>,
  token: string | null
): Promise<{ files: SkillFile[]; fetchFailureCount: number }> {
  // Phase 1: Collect all file entries from directory tree
  const entries = await collectFileEntries(owner, repo, path, ref, depth, headers, token);

  // Apply MAX_FILES limit
  if (entries.length > MAX_FILES) {
    console.warn(`[skill-files] Skill has ${entries.length} files, limiting to ${MAX_FILES}`);
    entries.length = MAX_FILES;
  }

  // Phase 2: Fetch file contents in parallel
  let totalSize = 0;
  let fetchFailureCount = 0;
  const tasks = entries.map((entry) => async (): Promise<SkillFile> => {
    const { item, relativePath } = entry;
    const isBinary = !isTextFile(item.name);

    if (!isBinary && item.size < 1024 * 1024 && totalSize + item.size <= MAX_TOTAL_SIZE) {
      try {
        const content = await fetchFileContent(owner, repo, item.path, ref, headers, token);
        totalSize += item.size;
        return {
          name: item.name,
          path: relativePath,
          content,
          size: item.size,
          isBinary: false,
          fetchFailed: false,
        };
      } catch {
        // Content fetch failed — mark as failed so we skip caching
        fetchFailureCount++;
        return {
          name: item.name,
          path: relativePath,
          content: '',
          size: item.size,
          isBinary: true,
          fetchFailed: true,
        };
      }
    }

    // Binary, too large, or total size exceeded
    return {
      name: item.name,
      path: relativePath,
      content: '',
      size: item.size,
      isBinary: true,
      fetchFailed: false,
    };
  });

  const files = await parallelLimit(tasks, PARALLEL_FETCH_LIMIT);
  return { files, fetchFailureCount };
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
