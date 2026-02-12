import type { Octokit } from '@octokit/rest';
import { TokenManager } from '../token-manager.js';import { OctokitPool } from '../octokit-pool.js';

export interface RepoResult {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  description: string | null;
  topics: string[];
  defaultBranch: string;
  isArchived: boolean;
  updatedAt: string;
}

/**
 * Topics that indicate a repository might contain skills
 * Includes both compound topics (claude-skills) and simple topics (skill)
 */
const SKILL_TOPICS = [
  // Compound skill topics
  'claude-skills',
  'agent-skills',
  'ai-skills',
  'claude-code',
  'codex-skills',
  'copilot-skills',
  'skill-md',
  'anthropic-skills',
  'claude-code-skills',
  'ai-agent-skills',
  // Simple skill topics (for repos like openclaw/skills with topic "skill")
  'skill',
  'skills',
  // Platform-specific
  'clawdhub',
  'clawdbot',
  'skillhub',
  // AI agent related
  'ai-agent',
  'claude-agent',
  'anthropic',
  'llm-skills',
  'mcp-skills',
  // Cursor-specific
  'cursor-rules',
  'cursorrules',
  // Windsurf-specific
  'windsurf-rules',
  'windsurfrules',
  // Copilot-specific
  'copilot-instructions',
  'github-copilot',
  // Codex-specific
  'codex-agent',
  'openai-codex',
];

/**
 * Search queries for repository descriptions and READMEs
 */
const REPO_SEARCH_QUERIES = [
  'SKILL.md in:readme',
  'claude skills in:description',
  'agent skills in:description',
  '"agent skill" in:readme',
  'claude code skill in:readme',
  'codex skill in:readme',
  'skill.md file in:readme',
  // Additional queries for platforms like clawdhub
  'clawdhub in:description',
  'clawdbot in:description',
  'claude code skills in:description',
  'agent skill in:name',
  'skills archive in:description',
  'anthropic skills in:description',
  '.cursorrules in:readme',
  'cursor rules in:description',
  'AGENTS.md in:readme',
  'codex agents in:description',
  'copilot-instructions in:readme',
  'windsurf rules in:description',
  '.windsurfrules in:readme',
];

/**
 * Topic Search Strategy
 * Discovers repositories using GitHub's topic and description search
 */
export class TopicSearchCrawler {
  private octokitPool: OctokitPool;
  private tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
    this.octokitPool = new OctokitPool(this.tokenManager);
  }

  private async getOctokit(): Promise<Octokit> {
    return this.octokitPool.getBestInstance();
  }

  private getCurrentToken(): string {
    return this.tokenManager.getBestToken();
  }

  /**
   * Search by all known skill-related topics
   */
  async searchByTopics(): Promise<RepoResult[]> {
    const allRepos: RepoResult[] = [];
    const seen = new Set<string>();

    console.log(`Searching by ${SKILL_TOPICS.length} skill-related topics...`);

    for (const topic of SKILL_TOPICS) {
      try {
        console.log(`  Searching topic: ${topic}`);

        const octokit = await this.getOctokit();
        const token = this.getCurrentToken();
        const response = await octokit.search.repos({
          q: `topic:${topic}`,
          sort: 'stars',
          order: 'desc',
          per_page: 100,
        });

        this.octokitPool.updateStats(token, response.headers);
        console.log(`    Found ${response.data.total_count} repos`);

        for (const repo of response.data.items) {
          if (!repo.owner) continue;
          const key = `${repo.owner.login}/${repo.name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          allRepos.push({
            owner: repo.owner.login,
            repo: repo.name,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            description: repo.description,
            topics: repo.topics || [],
            defaultBranch: repo.default_branch,
            isArchived: repo.archived,
            updatedAt: repo.updated_at,
          });
        }

        // Paginate if more results
        if (response.data.total_count > 100) {
          const additionalRepos = await this.paginateSearch(`topic:${topic}`, seen, 5);
          allRepos.push(...additionalRepos);
        }
      } catch (error) {
        console.warn(`  Topic search failed for ${topic}:`, error);
      }
    }

    console.log(`Topic search found ${allRepos.length} unique repositories`);
    return allRepos;
  }

  /**
   * Search by description and README content
   */
  async searchByDescription(): Promise<RepoResult[]> {
    const allRepos: RepoResult[] = [];
    const seen = new Set<string>();

    console.log(`Searching by ${REPO_SEARCH_QUERIES.length} description queries...`);

    for (const query of REPO_SEARCH_QUERIES) {
      try {
        console.log(`  Query: ${query}`);

        const octokit = await this.getOctokit();
        const token = this.getCurrentToken();
        const response = await octokit.search.repos({
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 100,
        });

        this.octokitPool.updateStats(token, response.headers);
        console.log(`    Found ${response.data.total_count} repos`);

        for (const repo of response.data.items) {
          if (!repo.owner) continue;
          const key = `${repo.owner.login}/${repo.name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          allRepos.push({
            owner: repo.owner.login,
            repo: repo.name,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            description: repo.description,
            topics: repo.topics || [],
            defaultBranch: repo.default_branch,
            isArchived: repo.archived,
            updatedAt: repo.updated_at,
          });
        }

        // Paginate if more results
        if (response.data.total_count > 100) {
          const additionalRepos = await this.paginateSearch(query, seen, 5);
          allRepos.push(...additionalRepos);
        }
      } catch (error) {
        console.warn(`  Description search failed for "${query}":`, error);
      }
    }

    console.log(`Description search found ${allRepos.length} unique repositories`);
    return allRepos;
  }

  /**
   * Paginate through search results
   */
  private async paginateSearch(
    query: string,
    seen: Set<string>,
    maxPages: number
  ): Promise<RepoResult[]> {
    const repos: RepoResult[] = [];

    for (let page = 2; page <= maxPages; page++) {
      try {
        const octokit = await this.getOctokit();
        const token = this.getCurrentToken();

        const response = await octokit.search.repos({
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 100,
          page,
        });

        this.octokitPool.updateStats(token, response.headers);

        if (response.data.items.length === 0) break;

        for (const repo of response.data.items) {
          if (!repo.owner) continue;
          const key = `${repo.owner.login}/${repo.name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          repos.push({
            owner: repo.owner.login,
            repo: repo.name,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            description: repo.description,
            topics: repo.topics || [],
            defaultBranch: repo.default_branch,
            isArchived: repo.archived,
            updatedAt: repo.updated_at,
          });
        }
      } catch (error) {
        // Stop on 422 (beyond 1000 results)
        if (this.isBeyondResultsLimit(error)) break;
        throw error;
      }
    }

    return repos;
  }

  /**
   * Run all topic and description searches
   */
  async discoverAll(): Promise<RepoResult[]> {
    const topicRepos = await this.searchByTopics();
    const descRepos = await this.searchByDescription();

    // Merge and deduplicate
    const seen = new Set<string>();
    const allRepos: RepoResult[] = [];

    for (const repo of [...topicRepos, ...descRepos]) {
      const key = `${repo.owner}/${repo.repo}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allRepos.push(repo);
    }

    console.log(`Total unique repositories discovered: ${allRepos.length}`);
    return allRepos;
  }

  private isBeyondResultsLimit(error: unknown): boolean {
    return (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 422
    );
  }
}

export function createTopicSearchCrawler(tokenManager?: TokenManager | string): TopicSearchCrawler {
  if (typeof tokenManager === 'string') {
    return new TopicSearchCrawler(new TokenManager([tokenManager]));
  }
  return new TopicSearchCrawler(tokenManager);
}
