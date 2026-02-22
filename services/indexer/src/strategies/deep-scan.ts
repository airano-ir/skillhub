import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';import { OctokitPool } from '../octokit-pool.js';
import type { SkillSource } from 'skillhub-core';
import { INSTRUCTION_FILE_PATTERNS, type SourceFormat } from 'skillhub-core';

export interface DeepScanOptions {
  allBranches?: boolean;
  extraBranchPatterns?: string[];
}

/** Well-known branch names that indicate important non-default branches. */
const IMPORTANT_BRANCH_NAMES = ['stable', 'next', 'latest', 'canary', 'dev', 'develop'];

/** Prefixes that indicate release/version branches. */
const IMPORTANT_BRANCH_PREFIXES = ['release/', 'releases/'];

/**
 * Pure helper: filter and sort branches to find important ones worth scanning.
 *
 * Rules:
 *   1. Always include defaultBranch first
 *   2. Include exact name matches from IMPORTANT_BRANCH_NAMES
 *   3. Include prefix matches from IMPORTANT_BRANCH_PREFIXES
 *   4. Include version branches matching /^[vV]\d/ — sorted by semver desc, top 5
 *   5. Include branches matching extraPatterns (exact or prefix match)
 *   6. Cap non-default branches at 5
 */
export function filterAndSortBranches(
  allBranchNames: string[],
  defaultBranch: string,
  extraPatterns: string[] = []
): string[] {
  const versionBranches: string[] = [];
  const otherImportant: string[] = [];

  for (const name of allBranchNames) {
    if (name === defaultBranch) continue;

    // Check well-known exact names
    if (IMPORTANT_BRANCH_NAMES.includes(name)) {
      otherImportant.push(name);
      continue;
    }

    // Check prefix patterns (release/, releases/)
    const lower = name.toLowerCase();
    if (IMPORTANT_BRANCH_PREFIXES.some(p => lower.startsWith(p))) {
      otherImportant.push(name);
      continue;
    }

    // Version branches: v* or V* followed by a digit (e.g., v4, v2.1, V3)
    if (/^[vV]\d/.test(name)) {
      versionBranches.push(name);
      continue;
    }

    // Check extra patterns from CLI (exact or prefix match)
    if (extraPatterns.length > 0) {
      const matched = extraPatterns.some(p => name === p || name.startsWith(p + '/'));
      if (matched) {
        otherImportant.push(name);
      }
    }
  }

  // Sort version branches by semver descending, take top 5
  const sortedVersionBranches = versionBranches
    .sort((a, b) => {
      const normalize = (s: string) =>
        s.replace(/^[vV]/, '').split(/[.\-x]/).map(n => parseInt(n) || 0);
      const aN = normalize(a);
      const bN = normalize(b);
      for (let i = 0; i < Math.max(aN.length, bN.length); i++) {
        const diff = (bN[i] || 0) - (aN[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    })
    .slice(0, 5);

  // Combine: other important first, then version branches, cap at 5 non-default total
  const nonDefault = [...otherImportant, ...sortedVersionBranches].slice(0, 5);
  return [defaultBranch, ...nonDefault];
}

/**
 * Deep Scan Strategy
 * Uses Git Trees API to recursively scan entire repositories for SKILL.md files
 * Can discover skills that aren't found by code search
 * Supports scanning multiple branches per repository
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
   * List important branches worth scanning beyond the default branch.
   * Calls octokit.repos.listBranches (1 API call).
   */
  private async listImportantBranches(
    owner: string,
    repo: string,
    defaultBranch: string,
    extraPatterns: string[] = []
  ): Promise<string[]> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });
      this.octokitPool.updateStats(token, response.headers);

      const allBranchNames = response.data.map(b => b.name);
      return filterAndSortBranches(allBranchNames, defaultBranch, extraPatterns);
    } catch {
      console.log(`  Could not list branches for ${owner}/${repo}, using default only`);
      return [defaultBranch];
    }
  }

  /**
   * List all branches in a repository (for --all-branches mode).
   * Handles pagination for repos with many branches.
   */
  private async listAllBranches(
    owner: string,
    repo: string,
    defaultBranch: string
  ): Promise<string[]> {
    const allBranches: string[] = [defaultBranch];
    let page = 1;

    for (;;) {
      try {
        const { octokit, token } = await this.getOctokit();
        const response = await octokit.repos.listBranches({
          owner,
          repo,
          per_page: 100,
          page,
        });
        this.octokitPool.updateStats(token, response.headers);

        for (const branch of response.data) {
          if (branch.name !== defaultBranch) {
            allBranches.push(branch.name);
          }
        }

        if (response.data.length < 100) break;
        page++;
      } catch {
        break;
      }
    }

    console.log(`  Found ${allBranches.length} total branches for ${owner}/${repo}`);
    return allBranches;
  }

  /**
   * Scan a single branch for instruction files using the Git Trees API.
   * Returns [] silently for truncated trees (fallback handles those at repo level).
   */
  private async scanSingleBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<SkillSource[]> {
    const skills: SkillSource[] = [];

    try {
      const { octokit, token } = await this.getOctokit();
      const tree = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: 'true',
      });
      this.octokitPool.updateStats(token, tree.headers);

      if (tree.data.truncated) {
        // Truncated — skip this branch silently
        return [];
      }

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
          branch,
          sourceFormat: matchedPattern.format,
        });
      }
    } catch (error) {
      if (this.isNotFoundError(error)) return [];
      // Rate limit and other errors propagate to scanRepository()
      throw error;
    }

    return skills;
  }

  /**
   * Deep scan a repository for all instruction files using Git Trees API.
   * Scans multiple important branches (version, release, well-known names).
   * Deduplicates skills across branches, preferring the default branch.
   */
  async scanRepository(owner: string, repo: string, options: DeepScanOptions = {}): Promise<SkillSource[]> {
    try {
      const { octokit, token } = await this.getOctokit();
      const repoInfo = await octokit.repos.get({ owner, repo });
      this.octokitPool.updateStats(token, repoInfo.headers);

      if (repoInfo.data.archived) {
        console.log(`  Skipping archived repo: ${owner}/${repo}`);
        return [];
      }

      const defaultBranch = repoInfo.data.default_branch;

      // Determine which branches to scan
      let branchesToScan: string[];
      if (options.allBranches) {
        branchesToScan = await this.listAllBranches(owner, repo, defaultBranch);
      } else {
        branchesToScan = await this.listImportantBranches(
          owner, repo, defaultBranch, options.extraBranchPatterns
        );
      }

      if (branchesToScan.length > 1) {
        console.log(`  Scanning ${branchesToScan.length} branches: ${branchesToScan.join(', ')}`);
      }

      // Collect skills from each branch, deduplicating by path::format
      const skillsByKey = new Map<string, SkillSource>();

      for (const branch of branchesToScan) {
        const branchSkills = await this.scanSingleBranch(owner, repo, branch);

        for (const skill of branchSkills) {
          const key = `${skill.path}::${skill.sourceFormat || 'skill.md'}`;
          const existing = skillsByKey.get(key);

          if (!existing) {
            skillsByKey.set(key, skill);
          } else if (existing.branch !== defaultBranch && skill.branch === defaultBranch) {
            // Prefer default branch version
            skillsByKey.set(key, skill);
          }
          // Otherwise keep existing (first non-default wins if default doesn't have it)
        }
      }

      const skills = Array.from(skillsByKey.values());

      if (skills.length > 0) {
        const nonDefault = skills.filter(s => s.branch !== defaultBranch);
        if (nonDefault.length > 0) {
          console.log(`  Found ${skills.length} skills in ${owner}/${repo} (${nonDefault.length} on non-default branches)`);
        } else {
          console.log(`  Found ${skills.length} skills in ${owner}/${repo}`);
        }
      }

      return skills;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      if (this.isTruncatedError(error)) {
        console.log(`  Repository ${owner}/${repo} is too large, using fallback scan`);
        return this.fallbackScanWithDefaultBranch(owner, repo);
      }
      if (this.isRateLimitError(error)) {
        console.log(`  Rate limit hit scanning ${owner}/${repo}, waiting for token rotation...`);
        await this.tokenManager.checkAndRotate();
        return this.scanRepository(owner, repo, options);
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
   * Wrapper: fetches defaultBranch then runs fallback scan.
   * Used when getTree is truncated for repos with >100k files.
   */
  private async fallbackScanWithDefaultBranch(owner: string, repo: string): Promise<SkillSource[]> {
    let defaultBranch = 'main';
    try {
      const { octokit, token } = await this.getOctokit();
      const repoInfo = await octokit.repos.get({ owner, repo });
      this.octokitPool.updateStats(token, repoInfo.headers);
      defaultBranch = repoInfo.data.default_branch;
    } catch {
      // Use 'main' as safe fallback
    }
    return this.fallbackScan(owner, repo, defaultBranch);
  }

  /**
   * Fallback scan for large repositories - scan known skill directories.
   * Uses the actual defaultBranch instead of hardcoding 'main'.
   */
  private async fallbackScan(owner: string, repo: string, defaultBranch: string): Promise<SkillSource[]> {
    const skills: SkillSource[] = [];
    const knownPaths = ['skills', '.claude/skills', '.github/skills', '.codex/skills', ''];

    for (const basePath of knownPaths) {
      try {
        const { octokit, token } = await this.getOctokit();

        const response = await octokit.repos.getContent({
          owner,
          repo,
          path: basePath || '.',
          ref: defaultBranch,
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
            branch: defaultBranch,
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
              ref: defaultBranch,
            });
            this.octokitPool.updateStats(subToken, subDir.headers);

            if (Array.isArray(subDir.data)) {
              const hasSubSkillMd = subDir.data.some((item) => item.name === 'SKILL.md');
              if (hasSubSkillMd) {
                skills.push({
                  owner,
                  repo,
                  path: dir.path,
                  branch: defaultBranch,
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
            branch: defaultBranch,
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
    repos: Array<{ owner: string; repo: string }>,
    options: DeepScanOptions = {}
  ): Promise<Map<string, SkillSource[]>> {
    const results = new Map<string, SkillSource[]>();

    for (const { owner, repo } of repos) {
      try {
        console.log(`Deep scanning: ${owner}/${repo}`);
        const skills = await this.scanRepository(owner, repo, options);
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
