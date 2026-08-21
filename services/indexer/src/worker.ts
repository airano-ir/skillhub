import { run, TaskList, JobHelpers } from 'graphile-worker';
import pLimit from 'p-limit';
import { createDb, type Database, discoveredRepoQueries, awesomeListQueries, addRequestQueries, skillQueries, runPostCrawlCuration } from '@skillhub/db';
import { GitHubCrawler, createCrawler } from './crawler.js';
import type { IndexJobData, IndexJobResult } from './queue.js';
import { setupRecurringJobs } from './queue.js';
import { logMeilisearchStatus } from './meilisearch-sync.js';
import { indexSkill } from './skill-indexer.js';
import { createStrategyOrchestrator, createDeepScanCrawler, createAwesomeListCrawler } from './strategies/index.js';

const CONCURRENCY = 5;

let db: Database | null = null;

// Redis connection removed as we use PostgreSQL for queue now

function getDb(): Database {
  if (!db) {
    db = createDb(process.env.DATABASE_URL);
  }
  return db;
}

// Adapter to make Graphile Worker job look like BullMQ job for our processors
class JobAdapter {
  id: string;
  data: IndexJobData;
  helpers: JobHelpers;
  processedOn?: number;

  constructor(payload: any, helpers: JobHelpers) {
    this.id = helpers.job.id;
    this.data = payload as IndexJobData;
    this.helpers = helpers;
    this.processedOn = Date.now();
  }

  async updateProgress(progress: number): Promise<void> {
    // Graphile worker doesn't have built-in progress tracking like BullMQ
    console.log(`[Job ${this.id}] Progress: ${progress}%`);
  }
}

/**
 * Start the indexing worker using graphile-worker
 */
export async function startWorker() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for graphile-worker');
  }

  const taskList: TaskList = {
    indexer: async (payload, helpers) => {
      const startTime = Date.now();
      const job = new JobAdapter(payload, helpers);

      console.log(`Processing job ${job.id}: ${job.data.type}`);

      try {
        let result: IndexJobResult;
        
        switch (job.data.type) {
          case 'full-crawl':
            result = await processFullCrawl(job as any);
            break;
          case 'incremental':
            result = await processIncrementalCrawl(job as any);
            break;
          case 'index-skill':
            result = await processSkillIndex(job as any);
            break;
          case 'discover-repos':
            result = await processDiscoverRepos(job as any);
            break;
          case 'awesome-lists':
            result = await processAwesomeLists(job as any);
            break;
          case 'deep-scan':
            result = await processDeepScan(job as any);
            break;
          case 'full-enhanced':
            result = await processFullEnhanced(job as any);
            break;
          case 'process-add-requests':
            result = await processAddRequests(job as any);
            break;
          default:
            throw new Error(`Unknown job type: ${(job.data as any).type}`);
        }
        
        console.log(`Job ${job.id} completed in ${result.stats?.duration || Date.now() - startTime}ms`);
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    },
  };

  console.log(`Starting Graphile Worker with concurrency ${CONCURRENCY}`);
  
  const runner = await run({
    connectionString,
    concurrency: CONCURRENCY,
    noHandleSignals: false,
    pollInterval: 1000,
    taskList,
  });

  return runner;
}

/**
 * Process a full crawl job
 */
async function processFullCrawl(
  job: JobAdapter
): Promise<IndexJobResult> {
  const crawler = new GitHubCrawler();
  const options = job.data.options || {};

  // Discover all skill repositories
  await job.updateProgress(10);
  console.log('Discovering skill repositories...');

  const sources = await crawler.discoverSkillRepos({
    minStars: options.minStars ?? 2,
    maxPages: 50,
  });

  console.log(`Discovered ${sources.length} potential skills`);
  await job.updateProgress(30);

  // Index each skill with rate limiting
  const limit = pLimit(3); // Process 3 at a time
  const results = { indexed: 0, failed: 0, skipped: 0 };

  const indexPromises = sources.map((source, index) =>
    limit(async () => {
      try {
        const skillId = await indexSkill(crawler, source, options.force);
        if (skillId) {
          results.indexed++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        console.error(`Failed to index ${source.owner}/${source.repo}:`, error);
        results.failed++;
      }

      // Update progress
      const progress = 30 + Math.floor((index / sources.length) * 60);
      await job.updateProgress(progress);
    })
  );

  await Promise.all(indexPromises);

  // Post-crawl curation: classify new skills, mark duplicates, update category counts
  try {
    const db = getDb();
    await runPostCrawlCuration(db);
  } catch (error) {
    console.error('[curation] Post-crawl curation failed (non-fatal):', error);
  }

  await job.updateProgress(100);

  return {
    success: true,
    stats: {
      discovered: sources.length,
      indexed: results.indexed,
      failed: results.failed,
      duration: Date.now() - job.processedOn!,
    },
  };
}

/**
 * Process an incremental crawl job
 */
async function processIncrementalCrawl(
  job: JobAdapter
): Promise<IndexJobResult> {
  const crawler = new GitHubCrawler();
  const options = job.data.options || {};

  const updatedAfter = options.updatedAfter
    ? new Date(options.updatedAfter)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  await job.updateProgress(10);
  console.log(`Looking for skills updated since ${updatedAfter.toISOString()}`);

  const sources = await crawler.discoverSkillRepos({
    minStars: 1,
    updatedAfter,
    maxPages: 20,
  });

  console.log(`Found ${sources.length} recently updated skills`);
  await job.updateProgress(30);

  const limit = pLimit(5);
  const results = { indexed: 0, failed: 0 };

  const indexPromises = sources.map((source, index) =>
    limit(async () => {
      try {
        await indexSkill(crawler, source, true);
        results.indexed++;
      } catch (error) {
        console.error(`Failed to index ${source.owner}/${source.repo}:`, error);
        results.failed++;
      }

      const progress = 30 + Math.floor((index / sources.length) * 60);
      await job.updateProgress(progress);
    })
  );

  await Promise.all(indexPromises);

  // Post-crawl curation: classify new skills, mark duplicates, update category counts
  try {
    const db = getDb();
    await runPostCrawlCuration(db);
  } catch (error) {
    console.error('[curation] Post-crawl curation failed (non-fatal):', error);
  }

  await job.updateProgress(100);

  return {
    success: true,
    stats: {
      discovered: sources.length,
      indexed: results.indexed,
      failed: results.failed,
      duration: Date.now() - job.processedOn!,
    },
  };
}

/**
 * Process a single skill index job
 */
async function processSkillIndex(
  job: JobAdapter
): Promise<IndexJobResult> {
  const source = job.data.source;
  if (!source) {
    throw new Error('Missing skill source');
  }

  const crawler = new GitHubCrawler();
  const force = job.data.options?.force ?? false;

  await job.updateProgress(10);

  try {
    const skillId = await indexSkill(crawler, {
      owner: source.owner,
      repo: source.repo,
      path: source.path || '.',
      branch: source.branch || 'main'
    }, force);

    if (skillId) {
      return {
        success: true,
        skillId,
      };
    } else {
      return {
        success: true,
        skillId: `${source.owner}/${source.repo}/${source.path}`,
        stats: { indexed: 0 },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process discover-repos job - run all discovery strategies
 */
async function processDiscoverRepos(
  job: JobAdapter
): Promise<IndexJobResult> {
  const database = getDb();
  const orchestrator = createStrategyOrchestrator();

  await job.updateProgress(10);
  console.log('Running all discovery strategies...');

  const { repos: discoveredRepos, stats: discoverStats } = await orchestrator.runAllStrategies();

  await job.updateProgress(50);
  console.log(`Discovered ${discoveredRepos.length} repositories, saving to database...`);

  let savedRepos = 0;
  for (const repo of discoveredRepos) {
    try {
      await discoveredRepoQueries.upsert(database, {
        id: `${repo.owner}/${repo.repo}`,
        owner: repo.owner,
        repo: repo.repo,
        discoveredVia: repo.discoveredVia,
        githubStars: repo.stars,
      });
      savedRepos++;
    } catch {
      // Skip duplicates
    }
  }

  await job.updateProgress(100);
  console.log(`Saved ${savedRepos} new repositories`);

  return {
    success: true,
    stats: {
      discovered: discoveredRepos.length,
      indexed: savedRepos,
      duration: discoverStats.duration,
    },
  };
}

/**
 * Process awesome-lists job - crawl curated lists for skill repos
 */
async function processAwesomeLists(
  job: JobAdapter
): Promise<IndexJobResult> {
  const database = getDb();
  const awesomeCrawler = createAwesomeListCrawler();

  await job.updateProgress(10);
  console.log('Running awesome list discovery...');

  // Save known lists to DB
  for (const list of awesomeCrawler.getKnownLists()) {
    await awesomeListQueries.upsert(database, {
      id: `${list.owner}/${list.repo}`,
      owner: list.owner,
      repo: list.repo,
      name: `${list.owner}/${list.repo}`,
    });
  }

  await job.updateProgress(30);
  const listResults = await awesomeCrawler.crawlAllLists();
  let awesomeTotal = 0;

  await job.updateProgress(60);
  for (const [listId, repoRefs] of listResults.entries()) {
    console.log(`${listId}: ${repoRefs.length} repos`);

    // Update list stats
    await awesomeListQueries.markParsed(database, listId, repoRefs.length);

    // Save repos
    for (const ref of repoRefs) {
      try {
        await discoveredRepoQueries.upsert(database, {
          id: `${ref.owner}/${ref.repo}`,
          owner: ref.owner,
          repo: ref.repo,
          discoveredVia: 'awesome-list',
          sourceUrl: `https://github.com/${listId}`,
        });
        awesomeTotal++;
      } catch {
        // Skip duplicates
      }
    }
  }

  await job.updateProgress(100);
  console.log(`Saved ${awesomeTotal} repositories from awesome lists`);

  return {
    success: true,
    stats: {
      discovered: awesomeTotal,
      indexed: awesomeTotal,
    },
  };
}

/**
 * Process deep-scan job - scan discovered repos for SKILL.md files
 */
async function processDeepScan(
  job: JobAdapter
): Promise<IndexJobResult> {
  const database = getDb();
  const deepCrawler = createDeepScanCrawler();
  const skillCrawler = createCrawler();
  const options = job.data.options || {};
  const scanLimit = options.scanLimit || 100;

  await job.updateProgress(10);
  console.log('Deep scanning discovered repositories...');

  // Get repos that need scanning (never scanned or stale)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const reposToScan = await discoveredRepoQueries.getNeedingScanning(database, oneWeekAgo, scanLimit);

  if (reposToScan.length === 0) {
    console.log('No repositories need scanning');
    return { success: true, stats: { discovered: 0, indexed: 0 } };
  }

  console.log(`Found ${reposToScan.length} repositories to scan`);

  let scannedCount = 0;
  let skillsDiscovered = 0;
  let skillsIndexed = 0;

  for (const repo of reposToScan) {
    try {
      console.log(`Scanning ${repo.owner}/${repo.repo}...`);
      const skills = await deepCrawler.scanRepository(repo.owner, repo.repo);

      // Mark as scanned
      await discoveredRepoQueries.markScanned(
        database,
        repo.id,
        skills.length,
        skills.length > 0
      );

      scannedCount++;
      skillsDiscovered += skills.length;

      // If skills found, index them
      if (skills.length > 0) {
        console.log(`  Found ${skills.length} skills, processing...`);
        for (const skillSource of skills) {
          try {
            const skillId = await indexSkill(skillCrawler, skillSource, false);
            if (skillId) {
              skillsIndexed++;
            }
          } catch (error) {
            console.error(`  Failed to index ${skillSource.path}:`, error);
          }
        }
      }

      // Update progress
      const progress = 10 + Math.floor((scannedCount / reposToScan.length) * 85);
      await job.updateProgress(progress);
    } catch (error) {
      console.log(`  Error scanning ${repo.owner}/${repo.repo}:`, error);
      await discoveredRepoQueries.markScanned(database, repo.id, 0, false, String(error));
    }
  }

  await job.updateProgress(100);
  console.log(`Deep scan complete: ${scannedCount} repos, ${skillsDiscovered} skills found, ${skillsIndexed} indexed`);

  return {
    success: true,
    stats: {
      discovered: skillsDiscovered,
      indexed: skillsIndexed,
    },
  };
}

/**
 * Process full-enhanced job - discovery + deep-scan + full-crawl
 */
async function processFullEnhanced(
  job: JobAdapter
): Promise<IndexJobResult> {
  const startTime = Date.now();

  // Step 1: Run discovery
  await job.updateProgress(5);
  console.log('Step 1/3: Running discovery strategies...');
  await processDiscoverRepos(job);

  // Step 2: Run deep scan
  await job.updateProgress(35);
  console.log('Step 2/3: Running deep scan...');
  await processDeepScan(job);

  // Step 3: Run full crawl
  await job.updateProgress(65);
  console.log('Step 3/3: Running full crawl...');
  const crawlResult = await processFullCrawl(job);

  await job.updateProgress(100);

  return {
    success: true,
    stats: {
      ...crawlResult.stats,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Process add-requests job - index user-submitted skill requests
 */
async function processAddRequests(
  job: JobAdapter
): Promise<IndexJobResult> {
  const database = getDb();
  const addCrawler = createCrawler();

  await job.updateProgress(10);
  console.log('Processing pending add requests...');

  // Get all pending add requests
  const pendingRequests = await addRequestQueries.getAllPending(database);

  if (pendingRequests.length === 0) {
    console.log('No pending add requests found');
    return { success: true, stats: { discovered: 0, indexed: 0 } };
  }

  console.log(`Found ${pendingRequests.length} pending request(s)`);

  let processedCount = 0;
  let skillsIndexed = 0;
  let failedCount = 0;

  for (const request of pendingRequests) {
    console.log(`Processing request ${request.id.slice(0, 8)}...`);

    // Skip if no skill paths found
    if (!request.hasSkillMd || !request.skillPath) {
      await addRequestQueries.updateStatus(database, request.id, {
        status: 'approved',
        errorMessage: 'No SKILL.md found - requires manual review',
      });
      continue;
    }

    try {
      // Parse repository URL
      const url = new URL(request.repositoryUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const owner = pathParts[0];
      const repo = pathParts[1];

      if (!owner || !repo) {
        throw new Error('Invalid repository URL');
      }

      // Get default branch
      const repoMeta = await addCrawler.getRepoMetadata(owner, repo);
      const branch = repoMeta.defaultBranch;

      // Parse skill paths (comma-separated)
      const skillPaths = request.skillPath.split(',').map((p: string) => p.trim());
      const indexedSkillIds: string[] = [];
      const existingSkillIds: string[] = [];

      for (const skillPath of skillPaths) {
        try {
          // Check if skill already exists
          const skillName = skillPath.split('/').pop() || 'skill';
          const potentialSkillId = `${owner}/${repo}/${skillName}`;
          const existingSkill = await skillQueries.getById(database, potentialSkillId);

          if (existingSkill && !existingSkill.isBlocked) {
            existingSkillIds.push(potentialSkillId);
            continue;
          }

          const skillId = await indexSkill(
            addCrawler,
            { owner, repo, path: skillPath || '.', branch },
            true
          );

          if (skillId) {
            indexedSkillIds.push(skillId);
            skillsIndexed++;
          }
        } catch (skillError) {
          console.error(`  Failed to index ${skillPath}:`, skillError);
        }
      }

      // Update request status
      const allSkillIds = [...indexedSkillIds, ...existingSkillIds];
      if (allSkillIds.length > 0) {
        await addRequestQueries.updateStatus(database, request.id, {
          status: 'indexed',
          indexedSkillId: allSkillIds.join(','),
        });
      } else {
        await addRequestQueries.updateStatus(database, request.id, {
          status: 'approved',
          errorMessage: 'Could not index any skills',
        });
      }

      processedCount++;
    } catch (error) {
      failedCount++;
      await addRequestQueries.updateStatus(database, request.id, {
        status: 'approved',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Update progress
    const progress = 10 + Math.floor((processedCount / pendingRequests.length) * 85);
    await job.updateProgress(progress);
  }

  await job.updateProgress(100);
  console.log(`Processed ${processedCount} requests, indexed ${skillsIndexed} skills, ${failedCount} failed`);

  return {
    success: true,
    stats: {
      discovered: pendingRequests.length,
      indexed: skillsIndexed,
      failed: failedCount,
    },
  };
}


// Run worker when this file is executed
console.log('Starting indexer worker...');
logMeilisearchStatus();
startWorker().catch(err => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});

// Setup recurring jobs for automatic crawling
setupRecurringJobs()
  .then(() => console.log('Recurring jobs initialized'))
  .catch((err) => console.error('Failed to setup recurring jobs:', err));

// Worker is managed in startWorker, no need for separate shutdown here in the file body
// The shutdown logic is already at the bottom of the file

