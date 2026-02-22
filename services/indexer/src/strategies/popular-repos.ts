import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';
import { OctokitPool } from '../octokit-pool.js';

export interface PopularRepoResult {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  defaultBranch: string;
  isArchived: boolean;
}

/**
 * Popular Repos Discovery Strategy
 * Discovers popular GitHub repos (by stars) and adds them to discovered_repos
 * so deep-scan can check their branches for SKILL.md files.
 *
 * This catches repos that add SKILL.md on non-default branches
 * which GitHub Code Search doesn't index.
 */
export class PopularReposCrawler {
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
   * Discover popular repos by star count ranges.
   * Segments by star ranges to bypass GitHub's 1000-result-per-query limit.
   */
  async discoverPopularRepos(minStars: number = 1000): Promise<PopularRepoResult[]> {
    const starRanges = this.buildStarRanges(minStars);
    const allRepos = new Map<string, PopularRepoResult>();

    console.log(`Discovering popular repos (${minStars}+ stars) across ${starRanges.length} ranges...`);

    for (const range of starRanges) {
      try {
        console.log(`\n  Searching: stars:${range}`);
        const repos = await this.searchByStarRange(range);
        for (const repo of repos) {
          const key = `${repo.owner}/${repo.repo}`.toLowerCase();
          if (!allRepos.has(key)) {
            allRepos.set(key, repo);
          }
        }
        console.log(`  Found ${repos.length} repos (total unique: ${allRepos.size})`);
      } catch (error) {
        console.warn(`  Failed for range stars:${range}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`\nTotal unique repos discovered: ${allRepos.size}`);
    return Array.from(allRepos.values());
  }

  /**
   * Build star ranges to segment search queries.
   * GitHub search returns max 1000 results per query.
   */
  private buildStarRanges(minStars: number): string[] {
    const ranges: string[] = [];
    const breakpoints = [500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

    // Filter breakpoints based on minStars
    const relevantBreaks = breakpoints.filter(b => b >= minStars);

    for (let i = 0; i < relevantBreaks.length; i++) {
      const low = i === 0 ? minStars : relevantBreaks[i - 1];
      const high = relevantBreaks[i];
      if (low < high) {
        ranges.push(`${low}..${high}`);
      }
    }

    // Add the final "greater than" range
    const lastBreak = relevantBreaks[relevantBreaks.length - 1] || minStars;
    ranges.push(`>${lastBreak}`);

    return ranges;
  }

  /**
   * Search repos within a specific star range.
   */
  private async searchByStarRange(starRange: string): Promise<PopularRepoResult[]> {
    const results: PopularRepoResult[] = [];
    const maxPages = 10;
    const perPage = 100;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const { octokit, token } = await this.getOctokit();
        const response = await octokit.search.repos({
          q: `stars:${starRange}`,
          sort: 'stars',
          order: 'desc',
          per_page: perPage,
          page,
        });
        this.octokitPool.updateStats(token, response.headers);

        for (const repo of response.data.items) {
          if (!repo.archived) {
            results.push({
              owner: repo.owner!.login,
              repo: repo.name,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              defaultBranch: repo.default_branch,
              isArchived: repo.archived,
            });
          }
        }

        if (response.data.items.length < perPage) break;
      } catch (error) {
        if (this.isBeyondResultsLimit(error)) {
          console.log(`    Reached 1000-result limit for stars:${starRange}`);
          break;
        }
        if (this.isRateLimitError(error)) {
          console.log(`    Rate limit hit, rotating token...`);
          await this.tokenManager.checkAndRotate();
          page--; // Retry same page
          continue;
        }
        throw error;
      }
    }

    return results;
  }

  private isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as { status?: number }).status;
    return status === 403 || status === 429;
  }

  private isBeyondResultsLimit(error: unknown): boolean {
    return (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 422
    );
  }
}

export function createPopularReposCrawler(tokenManager?: TokenManager | string): PopularReposCrawler {
  if (typeof tokenManager === 'string') {
    return new PopularReposCrawler(new TokenManager([tokenManager]));
  }
  return new PopularReposCrawler(tokenManager);
}
