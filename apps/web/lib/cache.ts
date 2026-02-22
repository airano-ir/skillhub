import Redis from 'ioredis';

// Redis client singleton
let redis: Redis | null = null;

/**
 * Get Redis client instance (singleton)
 * Returns null if REDIS_URL is not set (graceful degradation)
 */
export function getRedis(): Redis | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // eslint-disable-next-line no-console
    console.log('[Cache] REDIS_URL not set, caching disabled');
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[Cache] Redis error:', err.message);
    });

    redis.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[Cache] Redis connected');
    });

    return redis;
  } catch (error) {
    console.error('[Cache] Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Get cached data by key
 * Returns null if not cached or Redis unavailable
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

/**
 * Set cache with TTL (time-to-live in seconds)
 */
export async function setCache(
  key: string,
  data: unknown,
  ttlSeconds: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data));
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
  }
}

/**
 * Invalidate cache by exact key
 */
export async function invalidateCache(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.error(`[Cache] Error deleting key ${key}:`, error);
  }
}

/**
 * Invalidate cache by pattern (e.g., "skills:*")
 * Use with caution - KEYS command can be slow on large datasets
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      // eslint-disable-next-line no-console
      console.log(`[Cache] Invalidated ${keys.length} keys matching ${pattern}`);
    }
  } catch (error) {
    console.error(`[Cache] Error invalidating pattern ${pattern}:`, error);
  }
}

/**
 * Check if Redis is available and connected
 */
export async function isCacheAvailable(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached data or fetch and cache it.
 * If Redis is unavailable, falls back to fetcher directly (graceful degradation).
 */
export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  // Fire-and-forget cache write
  setCache(key, data, ttlSeconds).catch(() => {});
  return data;
}

// Cache key builders for consistency
export const cacheKeys = {
  stats: () => 'stats:global',
  homeStats: () => 'page:home:stats',
  homeFeatured: () => 'page:home:featured',
  categories: () => 'categories:all',
  categoriesHierarchical: () => 'categories:hierarchical',
  featuredSkills: () => 'skills:featured',
  featuredPage: (page: number) => `page:featured:${page}`,
  recentSkills: () => 'skills:recent',
  newSkills: (tab: string, page: number) => `page:new:${tab}:${page}`,
  newSkillsCounts: () => 'page:new:counts',
  ownerStats: (username: string) => `page:owner:${username}:stats`,
  ownerRepos: (username: string) => `page:owner:${username}:repos`,
  skillDetail: (id: string) => `page:skill:${id.replace(/\//g, ':')}`,
  skillRatings: (id: string, limit: number, offset: number) => `ratings:${id.replace(/\//g, ':')}:${limit}:${offset}`,
  pageCount: (page: string) => `page:${page}:count`,
  searchSkills: (hash: string) => `skills:search:${hash}`,
  skill: (id: string) => `skill:${id.replace(/\//g, ':')}`,
  skillView: (skillId: string, ip: string) => `view:${skillId.replace(/\//g, ':')}:${ip}`,
  skillDownload: (skillId: string, ip: string) => `download:${skillId.replace(/\//g, ':')}:${ip}`,
};

// TTL values in seconds
export const cacheTTL = {
  stats: 60 * 60,           // 1 hour
  categories: 12 * 60 * 60, // 12 hours
  featured: 2 * 60 * 60,    // 2 hours
  recent: 60 * 60,          // 1 hour
  search: 30 * 60,          // 30 minutes
  skill: 60 * 60,           // 1 hour
  newSkills: 30 * 60,       // 30 minutes
  owner: 30 * 60,           // 30 minutes
  ratings: 15 * 60,         // 15 minutes
  pageCount: 60 * 60,       // 1 hour
  view: 60 * 60,            // 1 hour - same IP can only count as 1 view per hour
  download: 5 * 60,         // 5 minutes - same IP can only count as 1 download per 5 min
};

/**
 * Check if a view should be counted for this IP + skill combination.
 * Returns true if this is a new view (should be counted), false if already viewed recently.
 * Uses Redis to track views per IP with 1-hour TTL.
 */
export async function shouldCountView(skillId: string, ip: string): Promise<boolean> {
  const client = getRedis();

  // If Redis is not available, always count (graceful degradation)
  if (!client) return true;

  const key = cacheKeys.skillView(skillId, ip);

  try {
    // Try to set the key with NX (only if not exists) and EX (expiry)
    // Returns 'OK' if set successfully (new view), null if already exists
    const result = await client.set(key, '1', 'EX', cacheTTL.view, 'NX');
    return result === 'OK';
  } catch (error) {
    console.error(`[Cache] Error checking view for ${skillId}:`, error);
    // On error, count the view (graceful degradation)
    return true;
  }
}

/**
 * Check if a download should be counted for this IP + skill combination.
 * Returns true if this is a new download (should be counted), false if already downloaded recently.
 * Uses Redis to track downloads per IP with 5-minute TTL (shorter than views to allow re-downloads).
 */
export async function shouldCountDownload(skillId: string, ip: string): Promise<boolean> {
  const client = getRedis();

  // If Redis is not available, always count (graceful degradation)
  if (!client) return true;

  const key = cacheKeys.skillDownload(skillId, ip);

  try {
    // Try to set the key with NX (only if not exists) and EX (expiry)
    // Returns 'OK' if set successfully (new download), null if already exists
    const result = await client.set(key, '1', 'EX', cacheTTL.download, 'NX');
    return result === 'OK';
  } catch (error) {
    console.error(`[Cache] Error checking download for ${skillId}:`, error);
    // On error, count the download (graceful degradation)
    return true;
  }
}

/**
 * Generate a simple hash for search query parameters
 */
export function hashSearchParams(params: Record<string, string | number | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
