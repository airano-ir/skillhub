import type { Octokit } from '@octokit/rest';
import { INSTRUCTION_FILE_PATTERNS, type SkillSource, type SourceFormat } from 'skillhub-core';
import { TokenManager } from './token-manager.js';
import { OctokitPool } from './octokit-pool.js';

export interface DiscoverOptions {
  minStars?: number;
  language?: string;
  updatedAfter?: Date;
  perPage?: number;
  maxPages?: number;
}

export interface SkillContent {
  skillMd: string;
  files: FileInfo[];
  scripts: ScriptFile[];
  references: ReferenceFile[];
  repoMeta: RepoMetadata;
}

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface ScriptFile {
  name: string;
  path: string;
  content: string;
  language?: string;
}

export interface ReferenceFile {
  name: string;
  path: string;
  content: string;
}

export interface RepoMetadata {
  stars: number;
  forks: number;
  license: string | null;
  description: string | null;
  updatedAt: string;
  createdAt: string;
  defaultBranch: string;
  topics: string[];
}

/**
 * Official skill sources that are always crawled
 */
const OFFICIAL_SKILL_SOURCES = [
  { owner: 'anthropics', repo: 'skills', skillsPath: 'skills' },
  { owner: 'anthropics', repo: 'claude-code', skillsPath: 'skills' },
];

/**
 * Known community skill repositories
 * Add more as they become available
 */
const COMMUNITY_SKILL_SOURCES = [
  { owner: 'obra', repo: 'superpowers', skillsPath: 'skills' },
  // openclaw/skills - Clawdhub archive with 2200+ skills (303 stars)
  { owner: 'openclaw', repo: 'skills', skillsPath: 'skills' },
  // Add more community sources here as they become available
];

/**
 * Common paths where skills are stored in repositories
 * Note: Used by deep-scan strategy to know where to look for skills
 * Exported so other modules can use this configuration
 */
export const SKILL_PATHS = [
  'skills',
  '.claude/skills',
  '.github/skills',
  '.codex/skills',
];

/**
 * GitHub Crawler for discovering and fetching Agent Skills
 */
export class GitHubCrawler {
  private octokitPool: OctokitPool;
  private tokenManager: TokenManager;
  private lastCodeSearchTime = 0;

  // GitHub Code Search secondary rate limit: ~10 req/min per token
  // Use 7s delay between requests for safety margin
  private static readonly CODE_SEARCH_DELAY_MS = 7000;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
    this.octokitPool = new OctokitPool(this.tokenManager);
  }

  /**
   * Enforce code search secondary rate limit delay
   */
  private async waitForCodeSearchSlot(): Promise<void> {
    const elapsed = Date.now() - this.lastCodeSearchTime;
    const delay = GitHubCrawler.CODE_SEARCH_DELAY_MS - elapsed;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.lastCodeSearchTime = Date.now();
  }

  private async getOctokit(): Promise<{ octokit: Octokit; token: string }> {
    return this.octokitPool.getBestInstance();
  }

  /**
   * Discover skills from all sources: official repos, community repos, and GitHub search
   */
  async discoverSkillRepos(options: DiscoverOptions = {}): Promise<SkillSource[]> {
    const results: SkillSource[] = [];

    // 1. Fetch from official Anthropic skills repository
    console.log('Fetching skills from official sources...');
    for (const source of OFFICIAL_SKILL_SOURCES) {
      try {
        const skills = await this.fetchSkillsFromRepo(source.owner, source.repo, source.skillsPath);
        console.log(`Found ${skills.length} skills in ${source.owner}/${source.repo}`);
        results.push(...skills);
      } catch (error) {
        console.warn(`Failed to fetch from ${source.owner}/${source.repo}:`, error);
      }
    }

    // 2. Fetch from known community repositories
    console.log('Fetching skills from community sources...');
    for (const source of COMMUNITY_SKILL_SOURCES) {
      try {
        const skills = await this.fetchSkillsFromRepo(source.owner, source.repo, source.skillsPath);
        console.log(`Found ${skills.length} skills in ${source.owner}/${source.repo}`);
        results.push(...skills);
      } catch (error) {
        console.warn(`Failed to fetch from ${source.owner}/${source.repo}:`, error);
      }
    }

    // 3. Search GitHub for other repositories with SKILL.md files
    console.log('Searching GitHub for additional skills...');
    const searchResults = await this.searchGitHubForSkills(options);
    console.log(`Found ${searchResults.length} skills from GitHub search`);
    results.push(...searchResults);

    return this.deduplicateResults(results);
  }

  /**
   * Fetch all skills from a specific repository's skills directory
   */
  async fetchSkillsFromRepo(owner: string, repo: string, skillsPath: string): Promise<SkillSource[]> {
    const results: SkillSource[] = [];

    try {
      // Get repository metadata for default branch
      const repoMeta = await this.getRepoMetadata(owner, repo);
      const branch = repoMeta.defaultBranch;

      // List contents of skills directory
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: skillsPath,
        ref: branch,
      });

      this.octokitPool.updateStats(token, response.headers);

      if (!Array.isArray(response.data)) {
        // Single file or not found - check if it's a SKILL.md at root
        if (skillsPath === '.' || skillsPath === '') {
          const hasSkillMd = await this.checkFileExists(owner, repo, 'SKILL.md', branch);
          if (hasSkillMd) {
            results.push({ owner, repo, path: '.', branch });
          }
        }
        return results;
      }

      // Check each subdirectory for SKILL.md
      for (const item of response.data) {
        if (item.type === 'dir') {
          const skillMdPath = `${skillsPath}/${item.name}/SKILL.md`;
          const hasSkillMd = await this.checkFileExists(owner, repo, skillMdPath, branch);

          if (hasSkillMd) {
            results.push({
              owner,
              repo,
              path: `${skillsPath}/${item.name}`,
              branch,
            });
          }
        }
      }

      return results;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a file exists in a repository
   */
  private async checkFileExists(owner: string, repo: string, path: string, ref: string): Promise<boolean> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      this.octokitPool.updateStats(token, response.headers);
      return 'content' in response.data;
    } catch {
      return false;
    }
  }

  /**
   * All search strategies for GitHub Code Search
   */
  private getSearchStrategies(): Array<{ label: string; query: string; format: SourceFormat }> {
    return [
      // === SKILL.md strategies ===
      { label: 'all-skills', query: 'filename:SKILL.md', format: 'skill.md' },
      { label: 'skills-folder', query: 'filename:SKILL.md path:skills', format: 'skill.md' },
      { label: 'claude-folder', query: 'filename:SKILL.md path:.claude', format: 'skill.md' },
      { label: 'github-folder', query: 'filename:SKILL.md path:.github', format: 'skill.md' },
      { label: 'codex-folder', query: 'filename:SKILL.md path:.codex', format: 'skill.md' },
      { label: 'small-files', query: 'filename:SKILL.md size:<1000', format: 'skill.md' },
      { label: 'medium-files', query: 'filename:SKILL.md size:1000..5000', format: 'skill.md' },
      { label: 'large-files', query: 'filename:SKILL.md size:>5000', format: 'skill.md' },
      // === AGENTS.md strategies (Codex) ===
      { label: 'agents-md', query: 'filename:AGENTS.md', format: 'agents.md' },
      { label: 'agents-md-sized', query: 'filename:AGENTS.md size:>200', format: 'agents.md' },
      // === .cursorrules strategies ===
      { label: 'cursorrules', query: 'filename:.cursorrules', format: 'cursorrules' },
      { label: 'cursorrules-sized', query: 'filename:.cursorrules size:>200', format: 'cursorrules' },
      // === .windsurfrules strategies ===
      { label: 'windsurfrules', query: 'filename:.windsurfrules', format: 'windsurfrules' },
      // === copilot-instructions.md strategies ===
      { label: 'copilot-instructions', query: 'filename:copilot-instructions.md path:.github', format: 'copilot-instructions' },
    ];
  }

  /**
   * Search GitHub for repositories containing SKILL.md files
   * Uses multiple search strategies to get more results
   */
  async searchGitHubForSkills(options: DiscoverOptions = {}): Promise<SkillSource[]> {
    const { minStars = 0, perPage = 100, maxPages = 10 } = options;

    const allResults: SkillSource[] = [];
    const searchStrategies = this.getSearchStrategies();

    console.log(`Starting multi-strategy GitHub search (${searchStrategies.length} strategies)...`);

    for (const strategy of searchStrategies) {
      console.log(`\n🔍 Strategy: ${strategy.label}`);
      const strategyResults = await this.runSegmentedSearch(
        strategy.query,
        strategy.label,
        { perPage, maxPages, minStars },
        strategy.format
      );
      allResults.push(...strategyResults);

      // Deduplicate after each strategy to see actual progress
      const currentUnique = this.deduplicateResults(allResults);
      console.log(`  → Found ${strategyResults.length} (unique total: ${currentUnique.length})`);
    }

    // Final deduplicate
    const deduplicated = this.deduplicateResults(allResults);
    console.log(`\n✅ Total unique skills from GitHub search: ${deduplicated.length}`);

    return deduplicated;
  }

  /**
   * Run a single segmented search query
   */
  private async runSegmentedSearch(
    query: string,
    segmentLabel: string,
    options: { perPage: number; maxPages: number; minStars: number },
    expectedFormat: SourceFormat = 'skill.md'
  ): Promise<SkillSource[]> {
    const { perPage, maxPages } = options;
    const results: SkillSource[] = [];
    let page = 1;

    // Resolve expected filename from the format
    const pattern = INSTRUCTION_FILE_PATTERNS.find(p => p.format === expectedFormat);
    const expectedFilename = pattern?.filename || 'SKILL.md';

    while (page <= maxPages) {
      try {
        // Enforce code search secondary rate limit delay
        await this.waitForCodeSearchSlot();

        const { octokit, token } = await this.getOctokit();
        const response = await octokit.search.code({
          q: query,
          per_page: perPage,
          page,
        });

        this.octokitPool.updateStats(token, response.headers);

        if (page === 1) {
          console.log(`  Query: ${query}`);
          console.log(`  Total available: ${response.data.total_count}`);
        }

        if (response.data.items.length === 0) {
          break;
        }

        for (const item of response.data.items) {
          if (item.name !== expectedFilename) {
            continue;
          }

          // Extract path: strip the filename to get the directory
          const escapedFilename = expectedFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const skillPath = item.path
            .replace(new RegExp(`/?${escapedFilename}$`), '') || '.';

          results.push({
            owner: item.repository.owner.login,
            repo: item.repository.name,
            path: skillPath,
            branch: '',  // empty → fetchSkillContent falls back to repoMeta.defaultBranch
            sourceFormat: expectedFormat,
          });
        }

        if (response.data.items.length < perPage) {
          break;
        }

        page++;
      } catch (error) {
        if (this.isSecondaryRateLimitError(error)) {
          // Secondary rate limit (code search) - wait and retry
          const retryAfter = this.getRetryAfterSeconds(error);
          console.log(`  ⏳ Code search rate limit, waiting ${retryAfter}s...`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        if (this.isRateLimitError(error)) {
          await this.waitForRateLimit();
          continue;
        }
        if (this.isBeyondResultsLimit(error)) {
          console.log(`  ⚠️ Reached 1000 limit for segment ${segmentLabel}`);
          break;
        }
        throw error;
      }
    }

    return results;
  }

  /**
   * Fetch a specific skill's content from GitHub
   */
  async fetchSkillContent(source: SkillSource): Promise<SkillContent> {
    // Rate limit is now handled by OctokitPool automatically
    const { owner, repo, path, branch } = source;
    const sourceFormat = source.sourceFormat || 'skill.md';

    // Get repository metadata
    const repoMeta = await this.getRepoMetadata(owner, repo);
    const actualBranch = branch || repoMeta.defaultBranch;

    // Determine file path based on format
    const pattern = INSTRUCTION_FILE_PATTERNS.find(p => p.format === sourceFormat);
    const filename = pattern?.filename || 'SKILL.md';
    let filePath: string;

    if (sourceFormat === 'copilot-instructions') {
      filePath = '.github/copilot-instructions.md';
    } else if (sourceFormat === 'cursorrules' || sourceFormat === 'windsurfrules') {
      filePath = filename; // Root-only files
    } else {
      filePath = path === '.' ? filename : `${path}/${filename}`;
    }

    const skillMd = await this.fetchFileContent(owner, repo, filePath, actualBranch);

    // For non-SKILL.md formats, don't look for scripts/references subdirectories
    const isStandaloneFormat = sourceFormat !== 'skill.md';

    const files = isStandaloneFormat
      ? []
      : await this.listDirectory(owner, repo, path === '.' ? '' : path, actualBranch);

    const scripts = isStandaloneFormat
      ? []
      : await this.fetchScripts(owner, repo, path, actualBranch, files);

    const references = isStandaloneFormat
      ? []
      : await this.fetchReferences(owner, repo, path, actualBranch, files);

    return {
      skillMd,
      files,
      scripts,
      references,
      repoMeta,
    };
  }

  /**
   * Get repository metadata
   */
  async getRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
    const { octokit, token } = await this.getOctokit();
    const response = await octokit.repos.get({ owner, repo });
    this.octokitPool.updateStats(token, response.headers);

    return {
      stars: response.data.stargazers_count,
      forks: response.data.forks_count,
      license: response.data.license?.spdx_id || null,
      description: response.data.description,
      updatedAt: response.data.updated_at,
      createdAt: response.data.created_at,
      defaultBranch: response.data.default_branch,
      topics: response.data.topics || [],
    };
  }

  /**
   * Fetch a GitHub user's public email address
   * First tries Profile API, then falls back to latest commit email
   */
  async fetchOwnerEmail(username: string): Promise<{ email: string | null; source: string | null }> {
    try {
      // Step 1: GitHub Profile API
      const { octokit, token } = await this.getOctokit();
      const userResponse = await octokit.users.getByUsername({ username });
      this.octokitPool.updateStats(token, userResponse.headers);

      if (userResponse.data.email) {
        return { email: userResponse.data.email, source: 'profile' };
      }

      // Step 2: Fallback — check recent commit emails from their repos
      try {
        const reposResponse = await octokit.repos.listForUser({
          username,
          sort: 'pushed',
          per_page: 1,
        });
        this.octokitPool.updateStats(token, reposResponse.headers);

        if (reposResponse.data.length > 0) {
          const repo = reposResponse.data[0];
          const commitsResponse = await octokit.repos.listCommits({
            owner: username,
            repo: repo.name,
            per_page: 5,
            author: username,
          });
          this.octokitPool.updateStats(token, commitsResponse.headers);

          for (const commit of commitsResponse.data) {
            const email = commit.commit.author?.email;
            if (
              email &&
              !email.includes('noreply') &&
              !email.includes('users.noreply.github.com') &&
              email.includes('@')
            ) {
              return { email, source: 'commit' };
            }
          }
        }
      } catch {
        // Fallback failed — not critical
      }

      return { email: null, source: null };
    } catch (error) {
      console.warn(`[Crawler] Could not fetch email for ${username}:`, error instanceof Error ? error.message : error);
      return { email: null, source: null };
    }
  }

  /**
   * Fetch a single file's content
   */
  private async fetchFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      this.octokitPool.updateStats(token, response.headers);

      if ('content' in response.data && response.data.type === 'file') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      throw new Error(`Path ${path} is not a file`);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  private async listDirectory(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<FileInfo[]> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: path || '.',
        ref,
      });

      this.octokitPool.updateStats(token, response.headers);

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: item.size,
      }));
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch all scripts from the skill
   */
  private async fetchScripts(
    owner: string,
    repo: string,
    basePath: string,
    ref: string,
    files: FileInfo[]
  ): Promise<ScriptFile[]> {
    const scripts: ScriptFile[] = [];
    const scriptsDir = files.find((f) => f.name === 'scripts' && f.type === 'dir');

    if (!scriptsDir) {
      return scripts;
    }

    const scriptPath = basePath === '.' ? 'scripts' : `${basePath}/scripts`;
    const scriptFiles = await this.listDirectory(owner, repo, scriptPath, ref);

    const scriptExtensions = ['.sh', '.bash', '.py', '.js', '.ts', '.rb', '.ps1'];

    for (const file of scriptFiles) {
      if (file.type !== 'file') continue;

      const ext = file.name.substring(file.name.lastIndexOf('.'));
      if (!scriptExtensions.includes(ext)) continue;

      try {
        const content = await this.fetchFileContent(owner, repo, file.path, ref);
        scripts.push({
          name: file.name,
          path: file.path,
          content,
          language: this.getLanguageFromExtension(ext),
        });
      } catch {
        // Skip files that can't be fetched
      }
    }

    return scripts;
  }

  /**
   * Fetch all reference files from the skill
   */
  private async fetchReferences(
    owner: string,
    repo: string,
    basePath: string,
    ref: string,
    files: FileInfo[]
  ): Promise<ReferenceFile[]> {
    const references: ReferenceFile[] = [];
    const refsDir = files.find((f) => f.name === 'references' && f.type === 'dir');

    if (!refsDir) {
      return references;
    }

    const refPath = basePath === '.' ? 'references' : `${basePath}/references`;
    const refFiles = await this.listDirectory(owner, repo, refPath, ref);

    // Only fetch text-based reference files
    const textExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css'];

    for (const file of refFiles) {
      if (file.type !== 'file') continue;
      if (file.size && file.size > 100000) continue; // Skip large files

      const ext = file.name.substring(file.name.lastIndexOf('.'));
      if (!textExtensions.includes(ext)) continue;

      try {
        const content = await this.fetchFileContent(owner, repo, file.path, ref);
        references.push({
          name: file.name,
          path: file.path,
          content,
        });
      } catch {
        // Skip files that can't be fetched
      }
    }

    return references;
  }

  /**
   * Get programming language from file extension
   */
  private getLanguageFromExtension(ext: string): string {
    const languages: Record<string, string> = {
      '.sh': 'bash',
      '.bash': 'bash',
      '.py': 'python',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.rb': 'ruby',
      '.ps1': 'powershell',
    };
    return languages[ext] || 'unknown';
  }

  /**
   * Search GitHub for skills of a specific format (e.g., cursorrules, agents.md)
   * Used by multi-platform crawl command to search one format at a time
   */
  async searchGitHubForSkillsByFormat(
    format: SourceFormat,
    options: DiscoverOptions = {}
  ): Promise<SkillSource[]> {
    const { perPage = 100, maxPages = 10, minStars = 0 } = options;
    const allResults: SkillSource[] = [];

    const matchingStrategies = this.getSearchStrategies().filter(s => s.format === format);
    if (matchingStrategies.length === 0) {
      console.log(`No search strategies defined for format: ${format}`);
      return [];
    }

    console.log(`Searching for ${format} files (${matchingStrategies.length} strategies)...`);

    for (const strategy of matchingStrategies) {
      console.log(`\n  Strategy: ${strategy.label}`);
      const results = await this.runSegmentedSearch(
        strategy.query,
        strategy.label,
        { perPage, maxPages, minStars },
        strategy.format
      );
      allResults.push(...results);
    }

    const deduplicated = this.deduplicateResults(allResults);
    console.log(`Found ${deduplicated.length} unique ${format} files`);
    return deduplicated;
  }

  /**
   * Deduplicate skill sources
   */
  private deduplicateResults(results: SkillSource[]): SkillSource[] {
    const seen = new Set<string>();
    return results.filter((source) => {
      const formatSuffix = source.sourceFormat && source.sourceFormat !== 'skill.md'
        ? `::${source.sourceFormat}` : '';
      const key = `${source.owner}/${source.repo}/${source.path}${formatSuffix}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }


  /**
   * Check if error is a secondary/abuse rate limit (code search throttle)
   * These return 403 with "You have exceeded a secondary rate limit" or "abuse"
   */
  private isSecondaryRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error) || !('status' in error)) return false;
    const status = (error as { status: number }).status;
    return (
      status === 403 &&
      (error.message.includes('secondary rate limit') ||
        error.message.includes('abuse detection'))
    );
  }

  /**
   * Extract retry-after seconds from error response, default 60s
   */
  private getRetryAfterSeconds(error: unknown): number {
    if (error instanceof Error && 'response' in error) {
      const resp = (error as { response?: { headers?: Record<string, string> } }).response;
      const retryAfter = resp?.headers?.['retry-after'];
      if (retryAfter) {
        return Math.max(parseInt(retryAfter, 10) || 60, 10);
      }
    }
    return 60;
  }

  /**
   * Check if error is a primary rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 403 &&
      error.message.includes('rate limit')
    );
  }

  /**
   * Check if error is a not found error
   */
  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error && 'status' in error && (error as { status: number }).status === 404
    );
  }

  /**
   * Check if error is due to exceeding GitHub's 1000 result limit
   */
  private isBeyondResultsLimit(error: unknown): boolean {
    return (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 422 &&
      error.message.includes('Cannot access beyond the first 1000 results')
    );
  }

  /**
   * Wait for rate limit to reset
   */
  private async waitForRateLimit(): Promise<void> {
    console.log('  ⏳ Rate limited, waiting 60 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }

  /**
   * Get current GitHub API rate limit status (all tokens)
   */
  async getRateLimitStatus(): Promise<{
    limit: number;
    remaining: number;
    resetAt: number;
  }> {
    const status = this.tokenManager.getStatus();
    return {
      limit: status.tokens[0]?.limit || 5000,
      remaining: status.globalRemaining,
      resetAt: status.nextReset,
    };
  }

  /**
   * Check if we have enough API budget to continue crawling.
   * Returns true if remaining quota is above the threshold percentage.
   * @param budgetPct - percentage of total limit to reserve (e.g., 0.33 = stop at 33% remaining)
   */
  async checkBudget(budgetPct = 0.33): Promise<{ ok: boolean; remaining: number; limit: number }> {
    // Refresh all tokens to get accurate counts
    for (const tokenInfo of this.tokenManager.getStatus().tokens) {
      await this.tokenManager.refreshRateLimit(tokenInfo.token);
    }
    const status = this.tokenManager.getStatus();
    const totalLimit = status.tokens.reduce((sum, t) => sum + t.limit, 0);
    const remaining = status.globalRemaining;
    const threshold = Math.floor(totalLimit * budgetPct);
    return {
      ok: remaining > threshold,
      remaining,
      limit: totalLimit,
    };
  }

  /**
   * Wait until API budget is replenished above the threshold
   */
  async waitForBudget(budgetPct = 0.33): Promise<void> {
    const status = this.tokenManager.getStatus();
    const nextReset = status.nextReset;
    const waitTime = Math.max(0, nextReset - Date.now()) + 2000;
    console.log(`\n⏳ API budget low. Waiting ${Math.ceil(waitTime / 1000)}s for rate limit reset...`);
    console.log(`   Reset at: ${new Date(nextReset).toLocaleTimeString()}`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    // Refresh after waiting
    for (const tokenInfo of this.tokenManager.getStatus().tokens) {
      await this.tokenManager.refreshRateLimit(tokenInfo.token);
    }
    const updated = await this.checkBudget(budgetPct);
    console.log(`   Budget restored: ${updated.remaining}/${updated.limit} remaining\n`);
  }
}

/**
 * Create a new GitHubCrawler instance
 * @param tokenManager - Optional TokenManager instance (backward compatible: accepts token string and creates single-token manager)
 */
export function createCrawler(tokenManager?: TokenManager | string): GitHubCrawler {
  // Backward compatibility: if string is passed, create single-token manager
  if (typeof tokenManager === 'string') {
    return new GitHubCrawler(new TokenManager([tokenManager]));
  }
  return new GitHubCrawler(tokenManager);
}
