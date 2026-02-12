import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries, type skills, isMeilisearchHealthy, searchSkills as meilisearchSearch } from '@skillhub/db';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';
import { getCached, setCache, hashSearchParams, cacheKeys } from '@/lib/cache';
import { captureException, log } from '@/lib/sentry';

// Create database connection
const db = createDb();

type Skill = typeof skills.$inferSelect;

/**
 * Restore skill ID from Meilisearch format
 * Converts sanitized IDs back to original format:
 *   "anthropics__skills__pdf" -> "anthropics/skills/pdf"
 *   "bdmorin___dot_claude__git" -> "bdmorin/.claude/git"
 *   "user__repo_dot_name__skill" -> "user/repo.name/skill"
 */
function restoreIdFromMeili(meiliId: string): string {
  return meiliId
    .replace(/_dot_/g, '.')  // _dot_ -> dot (do this FIRST)
    .replace(/__/g, '/');    // double underscore -> slash
}

export async function GET(request: NextRequest) {
  // Apply rate limiting (search is more expensive, use lower limit)
  const rateLimitResult = await withRateLimit(request, 'search');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const query = searchParams.get('q') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const category = searchParams.get('category') || undefined;
    const format = searchParams.get('format') || 'skill.md';
    const verified = searchParams.get('verified') === 'true';

    // Parse and validate numeric parameters
    const minStarsRaw = parseInt(searchParams.get('minStars') || '0');
    const minStars = isNaN(minStarsRaw) || minStarsRaw < 0 ? 0 : minStarsRaw;

    const sort = searchParams.get('sort') || 'stars';

    const pageRaw = parseInt(searchParams.get('page') || '1');
    const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

    const limitRaw = parseInt(searchParams.get('limit') || '20');
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100); // Max 100 per page

    const offset = (page - 1) * limit;

    // Create cache key from search parameters
    const searchHash = hashSearchParams({
      q: query,
      category,
      platform,
      format,
      verified: verified ? 'true' : undefined,
      sort,
      page,
      limit,
      minStars: minStars > 0 ? minStars : undefined,
    });
    const cacheKey = cacheKeys.searchSkills(searchHash);

    // Check cache first
    const cached = await getCached<{
      skills: Skill[];
      total: number;
      searchEngine: string;
    }>(cacheKey);

    if (cached) {
      return NextResponse.json(
        {
          skills: cached.skills,
          pagination: {
            page,
            limit,
            total: cached.total,
            totalPages: Math.ceil(cached.total / limit),
          },
          searchEngine: 'cache',
          cachedFrom: cached.searchEngine,
        },
        {
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    // Try Meilisearch for text search queries
    if (query) {
      const useMeilisearch = await isMeilisearchHealthy();

      if (useMeilisearch) {
        // Use Meilisearch for full-text search with relevance ranking
        // Note: category filter not supported in Meilisearch, handled in PostgreSQL fallback
        const meiliResult = await meilisearchSearch({
          query,
          filters: {
            platforms: platform && platform !== 'all' ? [platform] : undefined,
            minStars: minStars > 0 ? minStars : undefined,
            verified: verified ? true : undefined,
          },
          sort: sort as 'stars' | 'downloads' | 'rating' | 'recent',
          limit,
          offset,
        });

        if (meiliResult) {
          const skills = meiliResult.hits.map((hit) => ({
            id: restoreIdFromMeili(hit.id),
            name: hit.name,
            description: hit.description,
            githubOwner: hit.githubOwner,
            githubRepo: hit.githubRepo,
            githubStars: hit.githubStars,
            downloadCount: hit.downloadCount,
            securityScore: hit.securityScore,
            securityStatus: null, // Not available in Meilisearch yet
            rating: hit.rating,
            ratingCount: null, // Not available in Meilisearch yet
            isVerified: hit.isVerified,
            compatibility: { platforms: hit.platforms },
          }));

          // Cache the result (5 minutes TTL)
          await setCache(
            cacheKey,
            {
              skills,
              total: meiliResult.estimatedTotalHits,
              searchEngine: 'meilisearch',
            },
            5 * 60
          );

          return NextResponse.json({
            skills,
            pagination: {
              page,
              limit,
              total: meiliResult.estimatedTotalHits,
              totalPages: Math.ceil(meiliResult.estimatedTotalHits / limit),
            },
            searchEngine: 'meilisearch',
            processingTimeMs: meiliResult.processingTimeMs,
          }, {
            headers: createRateLimitHeaders(rateLimitResult),
          });
        }
        // If Meilisearch search failed, fall through to PostgreSQL
      }
    }

    // Fall back to PostgreSQL search
    // Map sort parameter to database column
    const sortByMap: Record<string, 'stars' | 'downloads' | 'rating' | 'updated' | 'lastDownloaded'> = {
      stars: 'stars',
      downloads: 'downloads',
      rating: 'rating',
      recent: 'updated',
      lastDownloaded: 'lastDownloaded',
      security: 'stars', // Use stars as fallback
    };
    const sortBy = sortByMap[sort] || 'downloads';

    // Build filter options for database query
    const filterOptions = {
      query,
      category: category || undefined,
      platform: platform && platform !== 'all' ? platform : undefined,
      sourceFormat: format,
      minStars,
      verified: verified || undefined,
    };

    // Get paginated results directly from database (no in-memory filtering)
    const paginatedResults = await skillQueries.search(db, {
      ...filterOptions,
      limit,
      offset,
      sortBy,
      sortOrder: 'desc',
    });

    // Get total count for pagination
    const total = await skillQueries.count(db, filterOptions);

    const skills = paginatedResults.map((skill: Skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      githubOwner: skill.githubOwner,
      githubRepo: skill.githubRepo,
      skillPath: skill.skillPath,
      version: skill.version,
      license: skill.license,
      githubStars: skill.githubStars,
      downloadCount: skill.downloadCount,
      securityScore: skill.securityScore,
      securityStatus: skill.securityStatus,
      rating: skill.rating,
      ratingCount: skill.ratingCount,
      isVerified: skill.isVerified,
      compatibility: skill.compatibility,
      updatedAt: skill.updatedAt,
    }));

    // Cache the result (5 minutes TTL)
    await setCache(
      cacheKey,
      {
        skills,
        total,
        searchEngine: 'postgresql',
      },
      5 * 60
    );

    return NextResponse.json({
      skills,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      searchEngine: 'postgresql',
    }, {
      headers: createRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    // Log and report error to Sentry
    log.error('Error fetching skills', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error, {
      tags: { route: '/api/skills' },
      extra: { searchParams: Object.fromEntries(request.nextUrl.searchParams) },
    });

    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    );
  }
}
