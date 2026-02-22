import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';
import { OctokitPool } from '../octokit-pool.js';

export interface CommitSearchRepoResult {
  owner: string;
  repo: string;
  stars?: number;
}

/**
 * Commits Search Discovery Strategy
 * Searches GitHub for recent commits mentioning "SKILL.md" in their messages.
 * This finds repos where someone recently added or modified a SKILL.md file,
 * even on non-default branches (unlike Code Search which only indexes default branches).
 *
 * Limitation: Searches commit messages, not file paths. Only catches commits
 * where the author mentioned "SKILL.md" in the message.
 */
export class CommitsSearchCrawler {
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
   * Search for recent commits mentioning SKILL.md in their messages.
   * Returns unique repos found.
   */
  async discoverReposFromCommits(daysBack: number = 30): Promise<CommitSearchRepoResult[]> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const dateStr = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const queries = [
      `SKILL.md committer-date:>${dateStr}`,
      `"add SKILL.md" committer-date:>${dateStr}`,
      `"SKILL.md" path:skills committer-date:>${dateStr}`,
    ];

    const allRepos = new Map<string, CommitSearchRepoResult>();

    console.log(`Searching commits from last ${daysBack} days (since ${dateStr})...`);

    for (const query of queries) {
      try {
        console.log(`\n  Query: ${query}`);
        const repos = await this.searchCommits(query);
        for (const repo of repos) {
          const key = `${repo.owner}/${repo.repo}`.toLowerCase();
          if (!allRepos.has(key)) {
            allRepos.set(key, repo);
          }
        }
        console.log(`  Found ${repos.length} repos (total unique: ${allRepos.size})`);
      } catch (error) {
        console.warn(`  Failed for query "${query}":`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`\nTotal unique repos from commits search: ${allRepos.size}`);
    return Array.from(allRepos.values());
  }

  /**
   * Execute a single commits search query and extract unique repos.
   */
  private async searchCommits(query: string): Promise<CommitSearchRepoResult[]> {
    const repos = new Map<string, CommitSearchRepoResult>();
    const maxPages = 5;
    const perPage = 100;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const { octokit, token } = await this.getOctokit();
        const response = await octokit.search.commits({
          q: query,
          sort: 'committer-date',
          order: 'desc',
          per_page: perPage,
          page,
        });
        this.octokitPool.updateStats(token, response.headers);

        if (page === 1) {
          console.log(`    Total results: ${response.data.total_count}`);
        }

        for (const item of response.data.items) {
          const repoData = item.repository;
          const key = `${repoData.owner.login}/${repoData.name}`.toLowerCase();
          if (!repos.has(key)) {
            repos.set(key, {
              owner: repoData.owner.login,
              repo: repoData.name,
            });
          }
        }

        if (response.data.items.length < perPage) break;
      } catch (error) {
        if (this.isBeyondResultsLimit(error)) {
          console.log(`    Reached 1000-result limit`);
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

    return Array.from(repos.values());
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

export function createCommitsSearchCrawler(tokenManager?: TokenManager | string): CommitsSearchCrawler {
  if (typeof tokenManager === 'string') {
    return new CommitsSearchCrawler(new TokenManager([tokenManager]));
  }
  return new CommitsSearchCrawler(tokenManager);
}
