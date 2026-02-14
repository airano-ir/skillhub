import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';import { OctokitPool } from '../octokit-pool.js';
import type { SkillSource } from 'skillhub-core';
import { INSTRUCTION_FILE_PATTERNS, type SourceFormat } from 'skillhub-core';

/**
 * Deep Scan Strategy
 * Uses Git Trees API to recursively scan entire repositories for SKILL.md files
 * Can discover skills that aren't found by code search
 */
export class DeepScanCrawler {
  private octokitPool: OctokitPool;
  private tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
    this.octokitPool = new OctokitPool(this.tokenManager);
  }

  private async getOctokit(): Promise<{ octokit: Octokit; token: string }> {
    return this.octokitPool.getBestInstance();
  }

  /**
   * Deep scan a repository for all SKILL.md files using Git Trees API
   * This is more thorough than code search as it scans the entire repo
   */
  async scanRepository(owner: string, repo: string): Promise<SkillSource[]> {
    const skills: SkillSource[] = [];

    try {
      // Get repository info for default branch
      const { octokit, token } = await this.getOctokit();
      const repoInfo = await octokit.repos.get({ owner, repo });
      this.octokitPool.updateStats(token, repoInfo.headers);

      if (repoInfo.data.archived) {
        console.log(`  Skipping archived repo: ${owner}/${repo}`);
        return [];
      }

      const defaultBranch = repoInfo.data.default_branch;

      // Get the full tree recursively
      const tree = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: 'true',
      });
      this.octokitPool.updateStats(token, tree.headers);

      // Find all instruction files (SKILL.md, .cursorrules, .windsurfrules, AGENTS.md, etc.)
      const instructionFiles = tree.data.tree.filter(
        (item) => {
          if (item.type !== 'blob' || !item.path) return false;
          return INSTRUCTION_FILE_PATTERNS.some(pattern => {
            if (pattern.rootOnly) return item.path === pattern.filename;
            if (pattern.pathFilter) return item.path!.includes(pattern.pathFilter) && (item.path!.endsWith('/' + pattern.filename) || item.path === pattern.filename);
            return item.path!.endsWith('/' + pattern.filename) || item.path === pattern.filename;
          });
        }
      );

      for (const file of instructionFiles) {
        if (!file.path) continue;
        const matchedPattern = INSTRUCTION_FILE_PATTERNS.find(pattern => {
          if (pattern.rootOnly) return file.path === pattern.filename;
          if (pattern.pathFilter) return file.path!.includes(pattern.pathFilter) && (file.path!.endsWith('/' + pattern.filename) || file.path === pattern.filename);
          return file.path!.endsWith('/' + pattern.filename) || file.path === pattern.filename;
        });
        if (!matchedPattern) continue;

        const escapedFilename = matchedPattern.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const skillPath = file.path.replace(new RegExp(`/?${escapedFilename}$`), '') || '.';

        skills.push({
          owner,
          repo,
          path: skillPath,
          branch: defaultBranch,
          sourceFormat: matchedPattern.format,
        });
      }
      if (skills.length > 0) {
        console.log(`  Found ${skills.length} skills in ${owner}/${repo}`);
      }

      return skills;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      if (this.isTruncatedError(error)) {
        // Tree is truncated (>100k files), fall back to directory listing
        console.log(`  Repository ${owner}/${repo} is too large, using fallback scan`);
        return this.fallbackScan(owner, repo);
      }
      if (this.isRateLimitError(error)) {
        console.log(`  Rate limit hit scanning ${owner}/${repo}, waiting for token rotation...`);
        await this.tokenManager.checkAndRotate();
        // Retry once after rotation
        return this.scanRepository(owner, repo);
      }
      throw error;
    }
  }

  private isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 429) return true;
    return error.message.includes('rate limit') || error.message.includes('secondary rate limit');
  }

  /**
   * Fallback scan for large repositories - scan known skill directories
   */
  private async fallbackScan(owner: string, repo: string): Promise<SkillSource[]> {
    const skills: SkillSource[] = [];
    const knownPaths = ['skills', '.claude/skills', '.github/skills', '.codex/skills', ''];

    for (const basePath of knownPaths) {
      try {
        const { octokit, token } = await this.getOctokit();

        const response = await octokit.repos.getContent({
          owner,
          repo,
          path: basePath || '.',
        });

        this.octokitPool.updateStats(token, response.headers);

        if (!Array.isArray(response.data)) continue;

        // Check for SKILL.md at this level
        const hasSkillMd = response.data.some((item) => item.name === 'SKILL.md');
        if (hasSkillMd) {
          skills.push({
            owner,
            repo,
            path: basePath || '.',
            branch: 'main',
            sourceFormat: 'skill.md' as SourceFormat,
          });
        }

        // Check subdirectories for SKILL.md
        const dirs = response.data.filter((item) => item.type === 'dir');
        for (const dir of dirs) {
          try {
            const { octokit: subOctokit, token: subToken } = await this.getOctokit();
            const subDir = await subOctokit.repos.getContent({
              owner,
              repo,
              path: dir.path,
            });
            this.octokitPool.updateStats(subToken, subDir.headers);

            if (Array.isArray(subDir.data)) {
              const hasSubSkillMd = subDir.data.some((item) => item.name === 'SKILL.md');
              if (hasSubSkillMd) {
                skills.push({
                  owner,
                  repo,
                  path: dir.path,
                  branch: 'main',
                  sourceFormat: 'skill.md' as SourceFormat,
                });
              }
            }
          } catch {
            // Skip inaccessible directories
          }
        }
      } catch {
        // Path doesn't exist, continue
      }
    }

    // Check for root-level instruction files (.cursorrules, .windsurfrules, AGENTS.md)
    const rootFiles = INSTRUCTION_FILE_PATTERNS.filter(p => p.format !== 'skill.md');
    for (const pattern of rootFiles) {
      try {
        const filePath = pattern.pathFilter ? `${pattern.pathFilter}${pattern.filename}` : pattern.filename;
        const fileContent = await this.getFileContent(owner, repo, filePath);
        if (fileContent && fileContent.length >= pattern.minContentLength) {
          skills.push({
            owner,
            repo,
            path: '.',
            branch: 'main',
            sourceFormat: pattern.format,
          });
        }
      } catch {
        // File doesn't exist
      }
    }

    return skills;
  }

  /**
   * Scan multiple repositories
   */
  async scanRepositories(
    repos: Array<{ owner: string; repo: string }>
  ): Promise<Map<string, SkillSource[]>> {
    const results = new Map<string, SkillSource[]>();

    for (const { owner, repo } of repos) {
      try {
        console.log(`Deep scanning: ${owner}/${repo}`);
        const skills = await this.scanRepository(owner, repo);
        results.set(`${owner}/${repo}`, skills);
      } catch (error) {
        console.warn(`  Failed to scan ${owner}/${repo}:`, error);
        results.set(`${owner}/${repo}`, []);
      }
    }

    return results;
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
      });
      this.octokitPool.updateStats(token, response.headers);

      if ('content' in response.data && response.data.type === 'file') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error && 'status' in error && (error as { status: number }).status === 404
    );
  }

  private isTruncatedError(error: unknown): boolean {
    // Git Trees API returns truncated: true for repos >100k files
    return error instanceof Error && error.message.includes('truncated');
  }
}

export function createDeepScanCrawler(tokenManager?: TokenManager | string): DeepScanCrawler {
  if (typeof tokenManager === 'string') {
    return new DeepScanCrawler(new TokenManager([tokenManager]));
  }
  return new DeepScanCrawler(tokenManager);
}
