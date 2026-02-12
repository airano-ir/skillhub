import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';
import { OctokitPool } from '../octokit-pool.js';

export interface RepoReference {
  owner: string;
  repo: string;
  url: string;
}

/**
 * Known awesome lists that contain skill repositories
 */
const KNOWN_AWESOME_LISTS = [
  { owner: 'travisvn', repo: 'awesome-claude-skills', readme: 'README.md' },
  { owner: 'VoltAgent', repo: 'awesome-claude-skills', readme: 'README.md' },
  { owner: 'ComposioHQ', repo: 'awesome-claude-skills', readme: 'README.md' },
  { owner: 'skillmatic-ai', repo: 'awesome-agent-skills', readme: 'README.md' },
  { owner: 'github', repo: 'awesome-copilot', readme: 'README.md' },
];

/**
 * Awesome List Crawler Strategy
 * Parses README files from curated "awesome" lists to discover skill repositories
 */
export class AwesomeListCrawler {
  private octokitPool: OctokitPool;
  private tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
    this.octokitPool = new OctokitPool(this.tokenManager);
  }

  private async getOctokit(): Promise<Octokit> {
    return this.octokitPool.getBestInstance();
  }

  /**
   * Get all known awesome lists
   */
  getKnownLists() {
    return KNOWN_AWESOME_LISTS;
  }

  /**
   * Crawl all known awesome lists
   */
  async crawlAllLists(): Promise<Map<string, RepoReference[]>> {
    const results = new Map<string, RepoReference[]>();

    for (const list of KNOWN_AWESOME_LISTS) {
      try {
        console.log(`Parsing awesome list: ${list.owner}/${list.repo}`);
        const repos = await this.parseAwesomeList(list.owner, list.repo, list.readme);
        results.set(`${list.owner}/${list.repo}`, repos);
        console.log(`  Found ${repos.length} repository references`);
      } catch (error) {
        console.warn(`Failed to parse ${list.owner}/${list.repo}:`, error);
        results.set(`${list.owner}/${list.repo}`, []);
      }
    }

    return results;
  }

  /**
   * Parse an awesome list README to extract GitHub repository references
   */
  async parseAwesomeList(
    owner: string,
    repo: string,
    readmePath = 'README.md'
  ): Promise<RepoReference[]> {
    try {
      const octokit = await this.getOctokit();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: readmePath,
      });

      if (!('content' in response.data)) {
        return [];
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return this.extractGitHubRepos(content);
    } catch (error) {
      console.warn(`Failed to fetch ${owner}/${repo}/${readmePath}:`, error);
      return [];
    }
  }

  /**
   * Extract GitHub repository references from markdown content
   */
  extractGitHubRepos(content: string): RepoReference[] {
    const repos: RepoReference[] = [];
    const seen = new Set<string>();

    // Pattern to match GitHub URLs: github.com/owner/repo
    // Supports various formats:
    // - https://github.com/owner/repo
    // - http://github.com/owner/repo
    // - github.com/owner/repo
    // - [text](https://github.com/owner/repo)
    const patterns = [
      /https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/g,
      /github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const owner = match[1];
        let repo = match[2];

        // Clean up repo name (remove trailing slashes, .git, anchors, etc.)
        repo = repo.replace(/\/$/, '').replace(/\.git$/, '').split('/')[0].split('#')[0];

        // Skip invalid repos
        if (!owner || !repo || repo.length === 0) continue;

        // Skip common non-repo patterns
        if (
          repo === 'issues' ||
          repo === 'pulls' ||
          repo === 'blob' ||
          repo === 'tree' ||
          repo === 'raw' ||
          repo === 'releases'
        ) {
          continue;
        }

        const key = `${owner}/${repo}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        repos.push({
          owner,
          repo,
          url: `https://github.com/${owner}/${repo}`,
        });
      }
    }

    return repos;
  }

  /**
   * Discover additional awesome lists from GitHub search
   */
  async discoverAwesomeLists(): Promise<RepoReference[]> {
    const searchQueries = [
      'awesome-claude-skills in:name',
      'awesome-agent-skills in:name',
      'awesome claude skills in:description',
      'awesome ai skills in:description',
    ];

    const allRepos: RepoReference[] = [];
    const seen = new Set<string>();

    for (const query of searchQueries) {
      try {
        const octokit = await this.getOctokit();
        const response = await octokit.search.repos({
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 30,
        });

        for (const repo of response.data.items) {
          if (!repo.owner) continue;
          const key = `${repo.owner.login}/${repo.name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          allRepos.push({
            owner: repo.owner.login,
            repo: repo.name,
            url: repo.html_url,
          });
        }
      } catch (error) {
        console.warn(`Search query failed: ${query}`, error);
      }
    }

    return allRepos;
  }
}

export function createAwesomeListCrawler(tokenManager?: TokenManager | string): AwesomeListCrawler {
  // Backward compatibility
  if (typeof tokenManager === 'string') {
    return new AwesomeListCrawler(new TokenManager([tokenManager]));
  }
  return new AwesomeListCrawler(tokenManager);
}
