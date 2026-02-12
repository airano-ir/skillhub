import { NextResponse } from 'next/server';
import { createDb, sql, isMeilisearchHealthy } from '@skillhub/db';
import { isCacheAvailable } from '@/lib/cache';

interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}

interface ReplicationStatus extends ServiceStatus {
  isReplica?: boolean;
  lagSeconds?: number;
}

interface GitHubStatus extends ServiceStatus {
  // GitHub accessibility status (for OAuth on mirror)
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  isPrimary: boolean;
  services: {
    database: ServiceStatus;
    meilisearch: ServiceStatus;
    redis: ServiceStatus;
    replication?: ReplicationStatus;
    github?: GitHubStatus;
  };
}

export async function GET() {
  const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';

  const services: HealthResponse['services'] = {
    database: { status: 'unhealthy' },
    meilisearch: { status: 'unhealthy' },
    redis: { status: 'unhealthy' },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    const db = createDb();
    await db.execute(sql`SELECT 1`);
    services.database = {
      status: 'healthy',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    // Don't expose DATABASE_URL or connection details in error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Sanitize error message - remove any potential credentials
    const sanitizedError = errorMessage
      .replace(/postgresql:\/\/[^@]*@/gi, 'postgresql://***@')
      .replace(/password[=:][^\s&]*/gi, 'password=***');

    services.database = {
      status: 'unhealthy',
      error: process.env.DATABASE_URL ? sanitizedError : 'DATABASE_URL not configured',
    };
  }

  // Check Meilisearch connectivity (optional service)
  try {
    const meiliStart = Date.now();
    const meiliHealthy = await isMeilisearchHealthy();
    if (meiliHealthy) {
      services.meilisearch = {
        status: 'healthy',
        latency: Date.now() - meiliStart,
      };
    } else {
      services.meilisearch = {
        status: 'degraded',
        error: 'Meilisearch not responding or not configured',
      };
    }
  } catch (error) {
    services.meilisearch = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check Redis connectivity (optional service for caching and rate limiting)
  try {
    const redisStart = Date.now();
    const redisHealthy = await isCacheAvailable();
    if (redisHealthy) {
      services.redis = {
        status: 'healthy',
        latency: Date.now() - redisStart,
      };
    } else {
      services.redis = {
        status: 'degraded',
        error: 'Redis not responding or not configured',
      };
    }
  } catch (error) {
    services.redis = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Mirror server only: Check PostgreSQL replication status
  if (!isPrimary) {
    try {
      const db = createDb();
      // drizzle-orm/postgres-js returns results directly as an array
      const lagResult = await db.execute<{ is_replica: boolean; lag_seconds: number | null }>(sql`
        SELECT
          pg_is_in_recovery() as is_replica,
          EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int as lag_seconds
      `);

      const row = lagResult[0];
      const isReplica = row?.is_replica ?? false;
      const lagSeconds = row?.lag_seconds ?? 0;

      // Healthy if lag is under 5 minutes (300 seconds)
      services.replication = {
        status: isReplica && lagSeconds < 300 ? 'healthy' : 'degraded',
        isReplica,
        lagSeconds,
        latency: undefined,
      };
    } catch (error) {
      services.replication = {
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Failed to check replication status',
        isReplica: false,
        lagSeconds: undefined,
      };
    }

    // Mirror server only: Check GitHub accessibility (for OAuth)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const githubStart = Date.now();
      const githubCheck = await fetch('https://github.com', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      services.github = {
        status: githubCheck.ok ? 'healthy' : 'degraded',
        latency: Date.now() - githubStart,
      };
    } catch {
      // GitHub likely filtered/blocked in Iran
      services.github = {
        status: 'degraded',
        error: 'GitHub unreachable (may be filtered)',
      };
    }
  }

  // Determine overall status
  let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

  // Database is critical - if it's down, the whole system is unhealthy
  if (services.database.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  }
  // Meilisearch and Redis are optional - if either is down, system is degraded but still functional
  else if (services.meilisearch.status !== 'healthy' || services.redis.status !== 'healthy') {
    overallStatus = 'degraded';
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    isPrimary,
    services,
  };

  // Return appropriate HTTP status code for load balancers/orchestrators
  // 200 = healthy, 503 = unhealthy (critical service down)
  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
  return NextResponse.json(response, { status: statusCode });
}
