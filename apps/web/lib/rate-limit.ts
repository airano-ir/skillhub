import Redis from 'ioredis';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Redis client singleton (shared with cache.ts)
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('[RateLimit] Redis error:', err.message);
    });

    return redis;
  } catch (error) {
    console.error('[RateLimit] Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Rate limit configuration
 * Liberal limits as requested by user
 */
interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Liberal limits for general API access
  anonymous: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 120,        // 120 req/min
  },
  authenticated: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 600,        // 600 req/min
  },
  // More restrictive for search (expensive operation)
  search: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 60,         // 60 req/min
  },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Check rate limit using sliding window algorithm
 */
export async function checkRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS = 'anonymous'
): Promise<RateLimitResult> {
  const client = getRedis();
  const config = RATE_LIMITS[type];

  // If Redis unavailable, allow request (fail open)
  if (!client) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: 0,
      limit: config.maxRequests,
    };
  }

  const key = `ratelimit:${type}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Use pipeline for atomic operations
    const pipeline = client.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count remaining entries
    pipeline.zcard(key);

    // Get the oldest entry timestamp (for reset time calculation)
    pipeline.zrange(key, 0, 0, 'WITHSCORES');

    const results = await pipeline.exec();

    if (!results) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: 0,
        limit: config.maxRequests,
      };
    }

    const count = results[1]?.[1] as number || 0;

    // Check if over limit
    if (count >= config.maxRequests) {
      const oldestEntry = results[2]?.[1] as string[] || [];
      const oldestTimestamp = oldestEntry[1] ? parseInt(oldestEntry[1]) : now;

      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestTimestamp + config.windowMs,
        limit: config.maxRequests,
      };
    }

    // Add current request to the window
    await client.zadd(key, now, `${now}:${Math.random()}`);
    await client.expire(key, Math.ceil(config.windowMs / 1000) + 1);

    return {
      allowed: true,
      remaining: config.maxRequests - count - 1,
      resetAt: now + config.windowMs,
      limit: config.maxRequests,
    };
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error);
    // Fail open on errors
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: 0,
      limit: config.maxRequests,
    };
  }
}

/**
 * Get client identifier from request
 * Uses X-Forwarded-For header or falls back to a default
 */
export function getClientIdentifier(request: NextRequest): string {
  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check for real IP header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fall back to a hash of other identifying headers
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `ua:${hashString(userAgent)}`;
}

/**
 * Simple hash function for fallback identification
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
}

/**
 * Create 429 Too Many Requests response
 * @param result - Rate limit result
 * @param type - Rate limit type (for message customization)
 * @param isAuthenticated - Whether user is logged in
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  type: keyof typeof RATE_LIMITS = 'anonymous',
  isAuthenticated: boolean = false
): NextResponse {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

  // Customize message based on context
  const message = `Rate limit exceeded (${result.limit} requests/minute). Please try again in ${retryAfter} seconds.`;

  // Add helpful tips
  let tip: string | undefined;
  if (type === 'search') {
    tip = 'Search operations are limited. Consider browsing categories instead.';
  } else if (!isAuthenticated) {
    tip = 'Sign in to increase your rate limit to 600 requests/minute.';
  }

  return NextResponse.json(
    {
      error: 'Too Many Requests',
      message,
      tip,
      retryAfter,
      limit: result.limit,
    },
    {
      status: 429,
      headers: {
        ...createRateLimitHeaders(result),
        'Retry-After': Math.max(1, retryAfter).toString(),
      },
    }
  );
}

/**
 * Rate limit middleware wrapper for API routes
 *
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const rateLimitResult = await withRateLimit(request, 'anonymous');
 *   if (!rateLimitResult.allowed) {
 *     return createRateLimitResponse(rateLimitResult);
 *   }
 *   // ... handle request
 * }
 * ```
 */
export async function withRateLimit(
  request: NextRequest,
  type: keyof typeof RATE_LIMITS = 'anonymous'
): Promise<RateLimitResult> {
  const identifier = getClientIdentifier(request);
  return checkRateLimit(identifier, type);
}
