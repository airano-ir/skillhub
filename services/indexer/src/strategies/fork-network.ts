import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';import { OctokitPool } from '../octokit-pool.js';

export interface ForkInfo {
  owner: string;
  repo: string;
  stars: number;
  updatedAt: string;
  isArchived: boolean;
  defaultBranch: string;
}

/**
 * Fork Network Strategy
 * Discovers skills by traversing fork networks of known skill repositories
 * Forks often contain modified or additional skills
 */
export class ForkNetworkCrawler {
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
   * Get all forks of a repository
   */
  async getForks(owner: string, repo: string, maxPages = 10): Promise<ForkInfo[]> {
    const forks: ForkInfo[] = [];
    let page = 1;

    while (page <= maxPages) {
      try {
        const { octokit, token } = await this.getOctokit();

        const response = await octokit.repos.listForks({
          owner,
          repo,
          sort: 'stargazers',
          per_page: 100,
          page,
        });

        this.octokitPool.updateStats(token, response.headers);

        if (response.data.length === 0) break;

        for (const fork of response.data) {
          // Skip old/abandoned forks (not updated in 1 year)
          const updatedAt = fork.updated_at ? new Date(fork.updated_at) : new Date(0);
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

          if (updatedAt < oneYearAgo) continue;

          forks.push({
            owner: fork.owner.login,
            repo: fork.name,
            stars: fork.stargazers_count ?? 0,
            updatedAt: fork.updated_at ?? new Date().toISOString(),
            isArchived: fork.archived ?? false,
            defaultBranch: fork.default_branch ?? 'main',
          });
        }

        if (response.data.length < 100) break;
        page++;
      } catch (error) {
        console.warn(`Failed to get forks page ${page} for ${owner}/${repo}:`, error);
        break;
      }
    }

    return forks;
  }

  /**
   * Get forks for multiple seed repositories
   */
  async discoverFromSeedRepos(
    seedRepos: Array<{ owner: string; repo: string }>
  ): Promise<ForkInfo[]> {
    const allForks: ForkInfo[] = [];
    const seen = new Set<string>();

    for (const seed of seedRepos) {
      try {
        console.log(`Fetching forks of ${seed.owner}/${seed.repo}...`);
        const forks = await this.getForks(seed.owner, seed.repo);

        for (const fork of forks) {
          const key = `${fork.owner}/${fork.repo}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          allForks.push(fork);
        }

        console.log(`  Found ${forks.length} active forks`);
      } catch (error) {
        console.warn(`Failed to get forks for ${seed.owner}/${seed.repo}:`, error);
      }
    }

    console.log(`Total unique forks discovered: ${allForks.length}`);
    return allForks;
  }

  /**
   * Get parent/source repository (for finding the original if we have a fork)
   */
  async getParentRepo(owner: string, repo: string): Promise<{ owner: string; repo: string } | null> {
    try {
      const { octokit, token } = await this.getOctokit();
      const response = await octokit.repos.get({ owner, repo });
      this.octokitPool.updateStats(token, response.headers);

      if (response.data.fork && response.data.parent) {
        return {
          owner: response.data.parent.owner.login,
          repo: response.data.parent.name,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all repositories in the same network (parent + siblings)
   */
  async getNetworkRepos(owner: string, repo: string): Promise<ForkInfo[]> {
    const repos: ForkInfo[] = [];
    const seen = new Set<string>();

    // Get parent if this is a fork
    const parent = await this.getParentRepo(owner, repo);
    const rootOwner = parent?.owner || owner;
    const rootRepo = parent?.repo || repo;

    // Add root repo
    try {
      const { octokit, token } = await this.getOctokit();
      const rootInfo = await octokit.repos.get({ owner: rootOwner, repo: rootRepo });
      this.octokitPool.updateStats(token, rootInfo.headers);

      const rootKey = `${rootOwner}/${rootRepo}`.toLowerCase();
      seen.add(rootKey);

      repos.push({
        owner: rootOwner,
        repo: rootRepo,
        stars: rootInfo.data.stargazers_count,
        updatedAt: rootInfo.data.updated_at,
        isArchived: rootInfo.data.archived,
        defaultBranch: rootInfo.data.default_branch,
      });
    } catch {
      // Root not accessible
    }

    // Get all forks of root
    const forks = await this.getForks(rootOwner, rootRepo);
    for (const fork of forks) {
      const key = `${fork.owner}/${fork.repo}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      repos.push(fork);
    }

    return repos;
  }

}

export function createForkNetworkCrawler(tokenManager?: TokenManager | string): ForkNetworkCrawler {
  if (typeof tokenManager === 'string') {
    return new ForkNetworkCrawler(new TokenManager([tokenManager]));
  }
  return new ForkNetworkCrawler(tokenManager);
}
