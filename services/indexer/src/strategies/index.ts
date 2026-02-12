/**
 * Strategy Orchestrator
 * Coordinates multiple discovery strategies for comprehensive skill discovery
 */

import { createAwesomeListCrawler } from './awesome-list.js';
import { createTopicSearchCrawler } from './topic-search.js';
import { createDeepScanCrawler } from './deep-scan.js';
import { createForkNetworkCrawler } from './fork-network.js';
import { TokenManager } from '../token-manager.js';
import type { SkillSource } from 'skillhub-core';

export interface DiscoveryResult {
  source: string;
  repos: Array<{
    owner: string;
    repo: string;
    stars?: number;
    discoveredVia: string;
  }>;
  skills: SkillSource[];
}

export interface DiscoveryStats {
  totalReposDiscovered: number;
  totalSkillsFound: number;
  byStrategy: {
    [key: string]: {
      repos: number;
      skills: number;
    };
  };
  duration: number;
}

/**
 * Strategy Orchestrator - coordinates all discovery strategies
 */
export class StrategyOrchestrator {
  private awesomeCrawler: ReturnType<typeof createAwesomeListCrawler>;
  private topicCrawler: ReturnType<typeof createTopicSearchCrawler>;
  private deepScanCrawler: ReturnType<typeof createDeepScanCrawler>;
  private forkCrawler: ReturnType<typeof createForkNetworkCrawler>;
  private tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
    this.awesomeCrawler = createAwesomeListCrawler(this.tokenManager);
    this.topicCrawler = createTopicSearchCrawler(this.tokenManager);
    this.deepScanCrawler = createDeepScanCrawler(this.tokenManager);
    this.forkCrawler = createForkNetworkCrawler(this.tokenManager);
  }

  /**
   * Run awesome list discovery
   */
  async runAwesomeListStrategy(): Promise<DiscoveryResult> {
    console.log('\n=== Running Awesome List Strategy ===');
    const startTime = Date.now();

    const listResults = await this.awesomeCrawler.crawlAllLists();

    const repos: DiscoveryResult['repos'] = [];
    const seen = new Set<string>();

    for (const repoRefs of listResults.values()) {
      for (const ref of repoRefs) {
        const key = `${ref.owner}/${ref.repo}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        repos.push({
          owner: ref.owner,
          repo: ref.repo,
          discoveredVia: 'awesome-list',
        });
      }
    }

    console.log(`Awesome list strategy completed in ${Date.now() - startTime}ms`);
    console.log(`Discovered ${repos.length} repositories from ${listResults.size} lists`);

    return {
      source: 'awesome-list',
      repos,
      skills: [],
    };
  }

  /**
   * Run topic search discovery
   */
  async runTopicSearchStrategy(): Promise<DiscoveryResult> {
    console.log('\n=== Running Topic Search Strategy ===');
    const startTime = Date.now();

    const repoResults = await this.topicCrawler.discoverAll();

    const repos = repoResults.map((r) => ({
      owner: r.owner,
      repo: r.repo,
      stars: r.stars,
      discoveredVia: 'topic-search',
    }));

    console.log(`Topic search strategy completed in ${Date.now() - startTime}ms`);
    console.log(`Discovered ${repos.length} repositories`);

    return {
      source: 'topic-search',
      repos,
      skills: [],
    };
  }

  /**
   * Run deep scan on discovered repositories
   */
  async runDeepScanStrategy(
    repos: Array<{ owner: string; repo: string }>
  ): Promise<DiscoveryResult> {
    console.log('\n=== Running Deep Scan Strategy ===');
    const startTime = Date.now();

    const scanResults = await this.deepScanCrawler.scanRepositories(repos);

    const allSkills: SkillSource[] = [];
    for (const skills of scanResults.values()) {
      allSkills.push(...skills);
    }

    console.log(`Deep scan strategy completed in ${Date.now() - startTime}ms`);
    console.log(`Found ${allSkills.length} skills in ${repos.length} repositories`);

    return {
      source: 'deep-scan',
      repos: [],
      skills: allSkills,
    };
  }

  /**
   * Run fork network discovery
   */
  async runForkNetworkStrategy(
    seedRepos: Array<{ owner: string; repo: string }>
  ): Promise<DiscoveryResult> {
    console.log('\n=== Running Fork Network Strategy ===');
    const startTime = Date.now();

    const forks = await this.forkCrawler.discoverFromSeedRepos(seedRepos);

    const repos = forks
      .filter((f) => !f.isArchived)
      .map((f) => ({
        owner: f.owner,
        repo: f.repo,
        stars: f.stars,
        discoveredVia: 'fork-network',
      }));

    console.log(`Fork network strategy completed in ${Date.now() - startTime}ms`);
    console.log(`Discovered ${repos.length} active forks`);

    return {
      source: 'fork-network',
      repos,
      skills: [],
    };
  }

  /**
   * Run all strategies and return combined results
   */
  async runAllStrategies(): Promise<{
    repos: Array<{
      owner: string;
      repo: string;
      stars?: number;
      discoveredVia: string;
    }>;
    stats: DiscoveryStats;
  }> {
    const startTime = Date.now();
    const stats: DiscoveryStats = {
      totalReposDiscovered: 0,
      totalSkillsFound: 0,
      byStrategy: {},
      duration: 0,
    };

    const allRepos: Map<string, {
      owner: string;
      repo: string;
      stars?: number;
      discoveredVia: string;
    }> = new Map();

    // 1. Awesome lists (fast, high yield)
    try {
      const awesomeResult = await this.runAwesomeListStrategy();
      stats.byStrategy['awesome-list'] = {
        repos: awesomeResult.repos.length,
        skills: 0,
      };
      for (const repo of awesomeResult.repos) {
        const key = `${repo.owner}/${repo.repo}`.toLowerCase();
        if (!allRepos.has(key)) {
          allRepos.set(key, repo);
        }
      }
    } catch (error) {
      console.error('Awesome list strategy failed:', error);
    }

    // 2. Topic search (medium speed, medium yield)
    try {
      const topicResult = await this.runTopicSearchStrategy();
      stats.byStrategy['topic-search'] = {
        repos: topicResult.repos.length,
        skills: 0,
      };
      for (const repo of topicResult.repos) {
        const key = `${repo.owner}/${repo.repo}`.toLowerCase();
        if (!allRepos.has(key)) {
          allRepos.set(key, repo);
        }
      }
    } catch (error) {
      console.error('Topic search strategy failed:', error);
    }

    // 3. Fork network (for high-star repos from above)
    try {
      const highStarRepos = Array.from(allRepos.values())
        .filter((r) => (r.stars || 0) >= 10)
        .slice(0, 50); // Top 50 repos by stars

      if (highStarRepos.length > 0) {
        const forkResult = await this.runForkNetworkStrategy(
          highStarRepos.map((r) => ({ owner: r.owner, repo: r.repo }))
        );
        stats.byStrategy['fork-network'] = {
          repos: forkResult.repos.length,
          skills: 0,
        };
        for (const repo of forkResult.repos) {
          const key = `${repo.owner}/${repo.repo}`.toLowerCase();
          if (!allRepos.has(key)) {
            allRepos.set(key, repo);
          }
        }
      }
    } catch (error) {
      console.error('Fork network strategy failed:', error);
    }

    stats.totalReposDiscovered = allRepos.size;
    stats.duration = Date.now() - startTime;

    console.log('\n=== Discovery Summary ===');
    console.log(`Total unique repositories: ${allRepos.size}`);
    console.log(`Duration: ${(stats.duration / 1000).toFixed(1)}s`);
    console.log('By strategy:');
    for (const [strategy, data] of Object.entries(stats.byStrategy)) {
      console.log(`  ${strategy}: ${data.repos} repos`);
    }

    return {
      repos: Array.from(allRepos.values()),
      stats,
    };
  }
}

export function createStrategyOrchestrator(tokenManager?: TokenManager | string): StrategyOrchestrator {
  if (typeof tokenManager === 'string') {
    return new StrategyOrchestrator(new TokenManager([tokenManager]));
  }
  return new StrategyOrchestrator(tokenManager);
}

// Re-export strategy creators
export { createAwesomeListCrawler } from './awesome-list.js';
export { createTopicSearchCrawler } from './topic-search.js';
export { createDeepScanCrawler } from './deep-scan.js';
export { createForkNetworkCrawler } from './fork-network.js';

// Re-export types
export type { RepoReference } from './awesome-list.js';
export type { RepoResult } from './topic-search.js';
export type { ForkInfo } from './fork-network.js';
