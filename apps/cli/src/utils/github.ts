import { Octokit } from '@octokit/rest';
import { INSTRUCTION_FILE_PATTERNS, type SourceFormat } from 'skillhub-core';
import https from 'https';

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'SkillHub-CLI/1.0',
      request: {
        timeout: 30000, // 30 second timeout
      },
    });
  }
  return octokit;
}

export interface SkillContent {
  skillMd: string;
  scripts: Array<{ name: string; content: string }>;
  references: Array<{ name: string; content: string }>;
  assets: Array<{ name: string; content: string }>; // base64 encoded
}

/**
 * Fetch file from raw.githubusercontent.com (fallback for network issues)
 */
async function fetchRawFile(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 404) {
        reject(new Error('File not found'));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => {
      reject(err);
    }).on('timeout', () => {
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Get the filename to look for based on sourceFormat
 */
function getInstructionFilename(sourceFormat: SourceFormat): string {
  const pattern = INSTRUCTION_FILE_PATTERNS.find(p => p.format === sourceFormat);
  return pattern?.filename || 'SKILL.md';
}

/**
 * Fetch skill content from GitHub
 */
export async function fetchSkillContent(
  owner: string,
  repo: string,
  skillPath: string,
  branch = 'main',
  sourceFormat: SourceFormat = 'skill.md'
): Promise<SkillContent> {
  const client = getOctokit();
  const filename = getInstructionFilename(sourceFormat);
  const isStandalone = sourceFormat !== 'skill.md';

  // Build paths to try for the instruction file
  const basePath = skillPath ? `${skillPath}/${filename}` : filename;
  let skillMdResponse;

  // For standalone formats (.cursorrules, .windsurfrules), they're at specific locations
  let pathsToTry: string[];
  if (sourceFormat === 'cursorrules' || sourceFormat === 'windsurfrules') {
    // Root-only files
    pathsToTry = [filename];
  } else if (sourceFormat === 'copilot-instructions') {
    // Must be in .github/
    pathsToTry = [`.github/${filename}`];
  } else if (sourceFormat === 'agents.md') {
    // Can be in root or subdirectories
    pathsToTry = [basePath];
    if (skillPath) {
      pathsToTry.push(filename); // Also try root
    }
  } else {
    // SKILL.md - try multiple common paths
    pathsToTry = [
      basePath,
      ...(skillPath && !skillPath.startsWith('skills/') ? [`skills/${skillPath}/SKILL.md`] : []),
      ...(skillPath && !skillPath.startsWith('.claude/') ? [`.claude/skills/${skillPath}/SKILL.md`] : []),
      ...(skillPath && !skillPath.startsWith('.github/') ? [`.github/skills/${skillPath}/SKILL.md`] : []),
    ];
  }

  for (const pathToTry of pathsToTry) {
    try {
      skillMdResponse = await client.repos.getContent({
        owner,
        repo,
        path: pathToTry,
        ref: branch,
      });
      // Success! Break out of loop
      break;
    } catch (error: any) {
      // If it's a timeout or network error, try raw.githubusercontent.com fallback
      if (error.message?.includes('timeout') || error.message?.includes('network')) {
        try {
          const rawContent = await fetchRawFile(owner, repo, pathToTry, branch);
          // Create a mock response compatible with Octokit
          skillMdResponse = {
            data: {
              content: Buffer.from(rawContent).toString('base64'),
              encoding: 'base64' as const,
            }
          } as any;
          break;
        } catch (rawError) {
          // If raw fetch also fails, throw original error
          throw new Error(`GitHub API timeout. Try using --no-api flag or check your network connection.`);
        }
      }
      // If 404, try next path
      if (error.status === 404) {
        continue;
      }
      // Other errors, throw immediately
      throw new Error(`Failed to fetch from GitHub: ${error.message}`);
    }
  }

  if (!skillMdResponse) {
    throw new Error(`${filename} not found at ${owner}/${repo} (tried ${pathsToTry.length} paths)`);
  }

  if (!('content' in skillMdResponse.data)) {
    throw new Error(`${filename} not found`);
  }

  const skillMd = Buffer.from(skillMdResponse.data.content, 'base64').toString('utf-8');

  // For standalone formats, skip scripts/references (they don't have subdirectories)
  if (isStandalone) {
    return {
      skillMd,
      scripts: [],
      references: [],
      assets: [],
    };
  }

  // Fetch scripts
  const scripts: SkillContent['scripts'] = [];
  try {
    const scriptsPath = skillPath ? `${skillPath}/scripts` : 'scripts';
    const scriptsResponse = await client.repos.getContent({
      owner,
      repo,
      path: scriptsPath,
      ref: branch,
    });

    if (Array.isArray(scriptsResponse.data)) {
      for (const file of scriptsResponse.data) {
        if (file.type === 'file') {
          const fileResponse = await client.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branch,
          });

          if ('content' in fileResponse.data) {
            scripts.push({
              name: file.name,
              content: Buffer.from(fileResponse.data.content, 'base64').toString('utf-8'),
            });
          }
        }
      }
    }
  } catch {
    // No scripts directory
  }

  // Fetch references
  const references: SkillContent['references'] = [];
  try {
    const refsPath = skillPath ? `${skillPath}/references` : 'references';
    const refsResponse = await client.repos.getContent({
      owner,
      repo,
      path: refsPath,
      ref: branch,
    });

    if (Array.isArray(refsResponse.data)) {
      for (const file of refsResponse.data) {
        if (file.type === 'file' && file.size && file.size < 100000) {
          const fileResponse = await client.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branch,
          });

          if ('content' in fileResponse.data) {
            references.push({
              name: file.name,
              content: Buffer.from(fileResponse.data.content, 'base64').toString('utf-8'),
            });
          }
        }
      }
    }
  } catch {
    // No references directory
  }

  return {
    skillMd,
    scripts,
    references,
    assets: [], // TODO: handle binary assets
  };
}

/**
 * Get default branch for a repository
 */
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const client = getOctokit();
  const response = await client.repos.get({ owner, repo });
  return response.data.default_branch;
}
