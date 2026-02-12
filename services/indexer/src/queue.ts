import { Queue, QueueEvents } from 'bullmq';
import type { SkillSource } from 'skillhub-core';

const QUEUE_NAME = 'skill-indexing';

// Parse REDIS_URL if provided, otherwise use REDIS_HOST/PORT
function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const url = new URL(redisUrl);
    const connection: {
      host: string;
      port: number;
      password?: string;
      username?: string;
    } = {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
    };
    // Add authentication if present in URL
    if (url.password) {
      connection.password = decodeURIComponent(url.password);
    }
    if (url.username && url.username !== 'default') {
      connection.username = decodeURIComponent(url.username);
    }
    return connection;
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };
}

export interface IndexJobData {
  type:
    | 'full-crawl'
    | 'incremental'
    | 'single-skill'
    | 'index-skill'
    | 'discover-repos'
    | 'awesome-lists'
    | 'deep-scan'
    | 'full-enhanced'
    | 'process-add-requests'
    ;
  source?: SkillSource;
  options?: {
    minStars?: number;
    updatedAfter?: string; // ISO date string
    force?: boolean;
    scanLimit?: number; // For deep-scan: max repos to scan
  };
}

export interface IndexJobResult {
  success: boolean;
  skillId?: string;
  error?: string;
  stats?: {
    discovered?: number;
    indexed?: number;
    failed?: number;
    duration?: number;
  };
}

let queue: Queue<IndexJobData, IndexJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the indexing queue
 */
export function getQueue(): Queue<IndexJobData, IndexJobResult> {
  if (!queue) {
    queue = new Queue<IndexJobData, IndexJobResult>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });
  }
  return queue;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queueEvents;
}

/**
 * Add a full crawl job to discover all skills
 */
export async function scheduleFullCrawl(options?: IndexJobData['options']): Promise<string> {
  const q = getQueue();
  const job = await q.add(
    'full-crawl',
    { type: 'full-crawl', options },
    {
      jobId: `full-crawl-${Date.now()}`,
      priority: 10,
    }
  );
  return job.id!;
}

/**
 * Add an incremental crawl job (only recent updates)
 */
export async function scheduleIncrementalCrawl(): Promise<string> {
  const q = getQueue();

  // Look for skills updated in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const job = await q.add(
    'incremental-crawl',
    {
      type: 'incremental',
      options: {
        updatedAfter: oneDayAgo.toISOString(),
      },
    },
    {
      jobId: `incremental-${Date.now()}`,
      priority: 5,
    }
  );
  return job.id!;
}

/**
 * Add a single skill indexing job
 */
export async function scheduleSkillIndex(
  source: SkillSource,
  force = false
): Promise<string> {
  const q = getQueue();
  const skillId = `${source.owner}/${source.repo}/${source.path}`;

  const job = await q.add(
    'index-skill',
    {
      type: 'index-skill',
      source,
      options: { force },
    },
    {
      jobId: `skill-${skillId.replace(/\//g, '-')}-${Date.now()}`,
      priority: 1,
    }
  );
  return job.id!;
}

/**
 * Setup recurring jobs for production
 *
 * Schedule:
 * - Daily at 1:00 AM: Awesome lists discovery (fast, high-yield)
 * - Daily at 2:00 AM: Incremental crawl (existing code search)
 * - Daily at 3:00 AM: Deep scan of discovered repos
 * - Weekly Sunday at 4:00 AM: Full discovery (all strategies)
 * - Weekly Sunday at 5:00 AM: Full crawl (code search)
 */
export async function setupRecurringJobs(): Promise<void> {
  const q = getQueue();

  // Remove existing repeatable jobs
  const repeatableJobs = await q.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await q.removeRepeatableByKey(job.key);
  }

  // Daily awesome lists discovery (1:00 AM) - fast, finds new repos quickly
  await q.add(
    'awesome-lists',
    { type: 'awesome-lists' },
    {
      repeat: {
        pattern: '0 1 * * *', // Every day at 1 AM
      },
      jobId: 'recurring-awesome-lists',
    }
  );

  // Daily incremental crawl (2:00 AM) - existing code search for updates
  await q.add(
    'incremental',
    { type: 'incremental' },
    {
      repeat: {
        pattern: '0 2 * * *', // Every day at 2 AM
      },
      jobId: 'recurring-incremental',
    }
  );

  // Daily deep scan (3:00 AM) - scan discovered repos for SKILL.md
  await q.add(
    'deep-scan',
    { type: 'deep-scan', options: { scanLimit: 100 } },
    {
      repeat: {
        pattern: '0 3 * * *', // Every day at 3 AM
      },
      jobId: 'recurring-deep-scan',
    }
  );


  // Weekly full discovery (Sunday 5:00 AM) - all strategies
  await q.add(
    'discover-repos',
    { type: 'discover-repos' },
    {
      repeat: {
        pattern: '0 5 * * 0', // Every Sunday at 5 AM
      },
      jobId: 'recurring-discover-repos',
    }
  );

  // Weekly full crawl (Sunday 6:00 AM) - code search for all SKILL.md
  await q.add(
    'full-crawl',
    { type: 'full-crawl' },
    {
      repeat: {
        pattern: '0 6 * * 0', // Every Sunday at 6 AM
      },
      jobId: 'recurring-full-crawl',
    }
  );

  // Process add requests (every 6 hours) - index user-submitted skill requests
  await q.add(
    'process-add-requests',
    { type: 'process-add-requests' },
    {
      repeat: {
        pattern: '30 */6 * * *', // Every 6 hours at :30
      },
      jobId: 'recurring-process-add-requests',
    }
  );

  console.log('Recurring jobs scheduled:');
  console.log('  - Daily 1:00 AM: Awesome lists discovery');
  console.log('  - Daily 2:00 AM: Incremental crawl');
  console.log('  - Daily 3:00 AM: Deep scan (100 repos)');
  console.log('  - Sunday 5:00 AM: Full discovery');
  console.log('  - Sunday 6:00 AM: Full crawl');
  console.log('  - Every 6h: Process add requests');
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const q = getQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Close queue connections
 */
export async function closeQueue(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
