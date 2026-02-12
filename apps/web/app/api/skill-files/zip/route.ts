import { type NextRequest } from 'next/server';
import { createDb, skillQueries } from '@skillhub/db';
import { withRateLimit, createRateLimitHeaders } from '@/lib/rate-limit';
import { getGitHubHeaders, updateTokenStats } from '@/lib/github-token-manager';
import { INSTRUCTION_FILE_PATTERNS } from 'skillhub-core';
import archiver from 'archiver';
import { Readable } from 'stream';

// Route configuration for longer timeout
export const maxDuration = 60;

// Create database connection
const db = createDb();

// Fetch timeout in milliseconds
const FETCH_TIMEOUT = 30000;

// Maximum recursion depth
const MAX_DEPTH = 5;

type Platform = 'claude' | 'codex' | 'copilot' | 'cursor' | 'windsurf';

const VALID_PLATFORMS: Platform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];

// All known main instruction file names
const MAIN_FILE_NAMES = INSTRUCTION_FILE_PATTERNS.map(p => p.filename);

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

// --- Platform transformation (mirrors InstallSection.tsx logic) ---

function stripFrontmatter(content: string): { body: string; description?: string; filePatterns?: string[] } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { body: content };

  const yaml = match[1];
  const body = match[2].trim();

  const descMatch = yaml.match(/^description:\s*(.+)$/m);
  const description = descMatch ? descMatch[1].trim() : undefined;

  const patternsMatch = yaml.match(/filePatterns:\s*\n((?:\s+-\s+.+\n?)+)/);
  let filePatterns: string[] | undefined;
  if (patternsMatch) {
    filePatterns = patternsMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').replace(/["']/g, '').trim())
      .filter(Boolean);
  }

  return { body, description, filePatterns };
}

function getPlatformFileName(platform: Platform, skillName: string): string {
  switch (platform) {
    case 'claude':
    case 'codex':
      return 'SKILL.md';
    case 'cursor':
      return `${skillName}.mdc`;
    case 'windsurf':
      return `${skillName}.md`;
    case 'copilot':
      return `${skillName}.instructions.md`;
  }
}

function transformContent(platform: Platform, content: string, skillName: string): string {
  if (platform === 'claude' || platform === 'codex') return content;

  const { body, description, filePatterns } = stripFrontmatter(content);

  if (platform === 'cursor') {
    const mdcFields: string[] = [];
    if (description) mdcFields.push(`description: ${description}`);
    if (filePatterns && filePatterns.length > 0) {
      mdcFields.push(`globs: ${filePatterns.join(', ')}`);
      mdcFields.push('alwaysApply: false');
    } else {
      mdcFields.push('alwaysApply: true');
    }
    return `---\n${mdcFields.join('\n')}\n---\n${body}\n`;
  }

  // windsurf / copilot: plain markdown
  let plainBody = body;
  if (!plainBody.startsWith('# ')) {
    plainBody = `# ${skillName}\n\n${plainBody}`;
  }
  return plainBody + '\n';
}

function isMainInstructionFile(fileName: string): boolean {
  return MAIN_FILE_NAMES.includes(fileName);
}

/**
 * GET /api/skill-files/zip?id=owner/repo/skill-name&platform=cursor
 * Returns a ZIP file containing all skill files, transformed for the target platform
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'search');
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  try {
    const skillId = request.nextUrl.searchParams.get('id');
    const platformParam = request.nextUrl.searchParams.get('platform');
    const platform: Platform = (platformParam && VALID_PLATFORMS.includes(platformParam as Platform))
      ? platformParam as Platform
      : 'claude';

    if (!skillId) {
      return new Response(
        JSON.stringify({ error: 'Missing skill ID parameter', code: 'MISSING_ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get skill from database
    const skill = await skillQueries.getById(db, skillId);

    if (!skill) {
      return new Response(
        JSON.stringify({ error: 'Skill not found', code: 'NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { githubOwner, githubRepo, skillPath, branch, name: skillName } = skill;

    // Try to get cached files first
    let files: SkillFile[];
    const cachedFiles = await skillQueries.getCachedFiles(db, skillId);

    if (cachedFiles) {
      // eslint-disable-next-line no-console
      console.log(`[skill-files/zip] Cache HIT for ${skillId}`);
      files = cachedFiles.items;
    } else {
      // Fetch from GitHub
      // eslint-disable-next-line no-console
      console.log(`[skill-files/zip] Cache MISS for ${skillId}, fetching from GitHub...`);
      const { headers: githubHeaders, token } = await getGitHubHeaders();

      files = await fetchSkillFiles(
        githubOwner,
        githubRepo,
        skillPath,
        branch || 'main',
        0,
        githubHeaders,
        token
      );

      // Save to cache (async, don't block)
      const filesToCache: CachedFiles = {
        fetchedAt: new Date().toISOString(),
        commitSha: skill.commitSha || 'unknown',
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        items: files,
      };
      skillQueries.updateCachedFiles(db, skillId, filesToCache).catch((err) => {
        console.error(`[skill-files/zip] Failed to cache files for ${skillId}:`, err);
      });
    }

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files found in skill', code: 'NO_FILES' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is a flat-file platform
    const isFlatPlatform = ['cursor', 'windsurf', 'copilot'].includes(platform);

    // Create ZIP archive using streaming
    const archive = archiver('zip', { zlib: { level: 6 } });

    // Add files to archive with platform-specific transformation
    for (const file of files) {
      if (file.content && !file.isBinary) {
        const isMainFile = isMainInstructionFile(file.name) && file.path === file.name;

        if (isMainFile) {
          const platformFileName = getPlatformFileName(platform, skillName);
          const transformed = transformContent(platform, file.content, skillName);
          if (isFlatPlatform) {
            archive.append(transformed, { name: platformFileName });
          } else {
            archive.append(transformed, { name: `${skillName}/${platformFileName}` });
          }
        } else {
          // Supporting files always go in subfolder
          archive.append(file.content, { name: `${skillName}/${file.path}` });
        }
      } else if (file.isBinary) {
        // For binary files, we need to fetch them
        const downloadUrl = `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${branch || 'main'}/${skillPath}/${file.path}`;
        try {
          const response = await fetch(downloadUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
          });
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            archive.append(Buffer.from(buffer), { name: `${skillName}/${file.path}` });
          }
        } catch {
          console.warn(`[skill-files/zip] Failed to fetch binary file: ${file.path}`);
        }
      }
    }

    // Finalize archive
    archive.finalize();

    // Convert Node.js stream to Web ReadableStream
    const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    // Sanitize filename for Content-Disposition header
    const safeFileName = skillName.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFileName}.zip"`,
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    console.error('[skill-files/zip] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
      return new Response(
        JSON.stringify({ error: 'GitHub API rate limit exceeded', code: 'RATE_LIMIT' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return new Response(
        JSON.stringify({ error: 'Request timed out', code: 'TIMEOUT' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Failed to generate ZIP', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Recursively fetch all files in a skill folder from GitHub
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
  if (depth > MAX_DEPTH) {
    console.warn(`Max depth (${MAX_DEPTH}) reached at: ${path}`);
    return [];
  }

  const files: SkillFile[] = [];
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

  for (const item of contents) {
    if (item.type === 'file') {
      const isBinary = !isTextFile(item.name);

      if (!isBinary && item.size < 1024 * 1024) {
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
          files.push({
            name: item.name,
            path: item.path.replace(`${path}/`, '').replace(path, '') || item.name,
            content: '',
            size: item.size,
            isBinary: true,
          });
        }
      } else {
        files.push({
          name: item.name,
          path: item.path.replace(`${path}/`, '').replace(path, '') || item.name,
          content: '',
          size: item.size,
          isBinary: true,
        });
      }
    } else if (item.type === 'dir') {
      const subPath = `${path}/${item.name}`;
      const subFiles = await fetchSkillFiles(owner, repo, subPath, ref, depth + 1, headers, token);

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
 * Fetch file content from GitHub
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
 */
function isTextFile(filename: string): boolean {
  const sensitivePatterns = ['.env', '.secret', '.key', '.pem', '.credential'];
  const lowerFilename = filename.toLowerCase();
  if (sensitivePatterns.some((p) => lowerFilename.includes(p))) {
    return false;
  }

  // Known instruction dotfiles that are plain text
  if (MAIN_FILE_NAMES.includes(filename)) {
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
