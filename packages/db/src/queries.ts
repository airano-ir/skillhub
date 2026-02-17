import { eq, desc, asc, and, gte, sql, inArray, like, not } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  skills,
  categories,
  skillCategories,
  users,
  ratings,
  installations,
  favorites,
  discoveredRepos,
  awesomeLists,
  removalRequests,
  addRequests,
  emailSubscriptions,
} from './schema.js';

import type * as schema from './schema.js';

// Local raw client for JSONB operations (avoids circular import)
let rawClient: ReturnType<typeof postgres> | null = null;
function getRawClientLocal() {
  if (!rawClient) {
    const connString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillhub';
    rawClient = postgres(connString);
  }
  return rawClient;
}

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Skill queries
 */
export const skillQueries = {
  /**
   * Get a skill by ID
   */
  getById: async (db: DB, id: string) => {
    const result = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
    return result[0] ?? null;
  },

  /**
   * Search skills with filters
   */
  search: async (
    db: DB,
    options: {
      query?: string;
      category?: string;
      platform?: string;
      sourceFormat?: string;
      minStars?: number;
      minSecurity?: number;
      verified?: boolean;
      limit?: number;
      offset?: number;
      sortBy?: 'stars' | 'downloads' | 'rating' | 'updated' | 'lastDownloaded';
      sortOrder?: 'asc' | 'desc';
    }
  ) => {
    const {
      query,
      category,
      platform,
      sourceFormat = 'skill.md',
      minStars = 0,
      minSecurity,
      verified,
      limit = 20,
      offset = 0,
      sortBy = 'stars',
      sortOrder = 'desc',
    } = options;

    const conditions = [
      eq(skills.isBlocked, false), // Filter out blocked skills
    ];

    // Filter by source format (default: SKILL.md only; 'all' shows everything)
    if (sourceFormat && sourceFormat !== 'all') {
      conditions.push(eq(skills.sourceFormat, sourceFormat));
    }

    if (query) {
      // Split query by whitespace and search each word independently
      // Also try hyphenated version for multi-word queries (e.g. "gemini watermark" -> "gemini-watermark")
      const words = query.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length > 1) {
        // Multi-word query: each word must appear in name/description/owner
        // Also match hyphenated version (spaces replaced with hyphens)
        const hyphenated = words.join('-');
        const wordConditions = words.map(word =>
          sql`(${skills.name} ILIKE ${`%${word}%`} OR ${skills.description} ILIKE ${`%${word}%`} OR ${skills.githubOwner} ILIKE ${`%${word}%`})`
        );
        conditions.push(
          sql`(
            (${sql.join(wordConditions, sql` AND `)})
            OR ${skills.name} ILIKE ${`%${hyphenated}%`}
            OR ${skills.description} ILIKE ${`%${hyphenated}%`}
          )`
        );
      } else {
        conditions.push(
          sql`(${skills.name} ILIKE ${`%${query}%`} OR ${skills.description} ILIKE ${`%${query}%`} OR ${skills.githubOwner} ILIKE ${`%${query}%`})`
        );
      }
    }

    if (minStars > 0) {
      conditions.push(gte(skills.githubStars, minStars));
    }

    if (minSecurity !== undefined) {
      conditions.push(gte(skills.securityScore, minSecurity));
    }

    if (verified !== undefined) {
      conditions.push(eq(skills.isVerified, verified));
    }

    // Filter by platform (stored in compatibility JSON field)
    if (platform && platform !== 'all') {
      conditions.push(
        sql`${skills.compatibility}->>'platforms' ILIKE ${`%${platform}%`}`
      );
    }

    const orderByColumn = {
      stars: skills.githubStars,
      downloads: skills.downloadCount,
      rating: skills.rating,
      updated: skills.updatedAt,
      lastDownloaded: skills.lastDownloadedAt,
    }[sortBy];

    // Secondary sort: when primary values are tied/zero, fall back to another metric
    const secondaryColumn = {
      stars: skills.downloadCount,
      downloads: skills.githubStars,
      rating: skills.githubStars,
      updated: skills.githubStars,
      lastDownloaded: skills.downloadCount,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    // For lastDownloaded sort, use NULLS LAST so never-downloaded skills
    // don't dominate the first pages (PostgreSQL puts NULLs first in DESC by default)
    const primaryOrder = sortBy === 'lastDownloaded'
      ? sql`${skills.lastDownloadedAt} DESC NULLS LAST`
      : orderFn(orderByColumn);

    // If filtering by category, use JOIN with skillCategories
    if (category) {
      const results = await db
        .select({ skill: skills })
        .from(skills)
        .innerJoin(skillCategories, eq(skills.id, skillCategories.skillId))
        .where(
          conditions.length > 0
            ? and(eq(skillCategories.categoryId, category), ...conditions)
            : eq(skillCategories.categoryId, category)
        )
        .orderBy(primaryOrder, desc(secondaryColumn), asc(skills.id))
        .limit(limit)
        .offset(offset);

      return results.map((r) => r.skill);
    }

    const results = await db
      .select()
      .from(skills)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(primaryOrder, desc(secondaryColumn), asc(skills.id))
      .limit(limit)
      .offset(offset);

    return results;
  },

  /**
   * Count skills matching filters (for pagination)
   */
  count: async (
    db: DB,
    options: {
      query?: string;
      category?: string;
      platform?: string;
      sourceFormat?: string;
      minStars?: number;
      minSecurity?: number;
      verified?: boolean;
    }
  ): Promise<number> => {
    const { query, category, platform, sourceFormat = 'skill.md', minStars = 0, minSecurity, verified } = options;

    const conditions = [
      eq(skills.isBlocked, false), // Filter out blocked skills
    ];

    // Filter by source format (default: SKILL.md only; 'all' shows everything)
    if (sourceFormat && sourceFormat !== 'all') {
      conditions.push(eq(skills.sourceFormat, sourceFormat));
    }

    if (query) {
      const words = query.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length > 1) {
        const hyphenated = words.join('-');
        const wordConditions = words.map(word =>
          sql`(${skills.name} ILIKE ${`%${word}%`} OR ${skills.description} ILIKE ${`%${word}%`} OR ${skills.githubOwner} ILIKE ${`%${word}%`})`
        );
        conditions.push(
          sql`(
            (${sql.join(wordConditions, sql` AND `)})
            OR ${skills.name} ILIKE ${`%${hyphenated}%`}
            OR ${skills.description} ILIKE ${`%${hyphenated}%`}
          )`
        );
      } else {
        conditions.push(
          sql`(${skills.name} ILIKE ${`%${query}%`} OR ${skills.description} ILIKE ${`%${query}%`} OR ${skills.githubOwner} ILIKE ${`%${query}%`})`
        );
      }
    }

    if (minStars > 0) {
      conditions.push(gte(skills.githubStars, minStars));
    }

    if (minSecurity !== undefined) {
      conditions.push(gte(skills.securityScore, minSecurity));
    }

    if (verified !== undefined) {
      conditions.push(eq(skills.isVerified, verified));
    }

    if (platform && platform !== 'all') {
      conditions.push(
        sql`${skills.compatibility}->>'platforms' ILIKE ${`%${platform}%`}`
      );
    }

    // If filtering by category, use JOIN
    if (category) {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(skills)
        .innerJoin(skillCategories, eq(skills.id, skillCategories.skillId))
        .where(
          conditions.length > 0
            ? and(eq(skillCategories.categoryId, category), ...conditions)
            : eq(skillCategories.categoryId, category)
        );

      return result[0]?.count ?? 0;
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.count ?? 0;
  },

  /**
   * Get featured skills with pagination
   */
  getFeatured: async (db: DB, limit = 10, offset = 0) => {
    return db
      .select()
      .from(skills)
      .where(and(eq(skills.isFeatured, true), eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md')))
      .orderBy(desc(skills.githubStars))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count featured skills
   */
  countFeatured: async (db: DB) => {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(and(eq(skills.isFeatured, true), eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md')));
    return result[0]?.count ?? 0;
  },

  /**
   * Get trending skills (most downloads in recent period)
   */
  getTrending: async (db: DB, limit = 10) => {
    return db.select().from(skills).where(and(eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md'))).orderBy(desc(skills.downloadCount)).limit(limit);
  },

  /**
   * Get recently added skills with pagination (sorted by creation date)
   */
  getRecent: async (db: DB, limit = 10, offset = 0) => {
    return db.select().from(skills).where(and(eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md'))).orderBy(desc(skills.createdAt)).limit(limit).offset(offset);
  },

  /**
   * Get NEW skills - created within the last 7 days
   */
  getNewSkills: async (db: DB, limit = 10, offset = 0) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.isBlocked, false),
          eq(skills.sourceFormat, 'skill.md'),
          gte(skills.createdAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(skills.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count NEW skills - created within the last 7 days
   */
  countNewSkills: async (db: DB) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(
        and(
          eq(skills.isBlocked, false),
          eq(skills.sourceFormat, 'skill.md'),
          gte(skills.createdAt, sevenDaysAgo)
        )
      );
    return result[0]?.count ?? 0;
  },

  /**
   * Get UPDATED skills - created > 7 days ago, updated within 7 days, updatedAt > createdAt + 1 hour
   */
  getUpdatedSkills: async (db: DB, limit = 10, offset = 0) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.isBlocked, false),
          eq(skills.sourceFormat, 'skill.md'),
          sql`${skills.createdAt} < ${sevenDaysAgo}`,
          gte(skills.updatedAt, sevenDaysAgo),
          sql`${skills.updatedAt} > ${skills.createdAt} + interval '1 hour'`
        )
      )
      .orderBy(desc(skills.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count UPDATED skills
   */
  countUpdatedSkills: async (db: DB) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(
        and(
          eq(skills.isBlocked, false),
          eq(skills.sourceFormat, 'skill.md'),
          sql`${skills.createdAt} < ${sevenDaysAgo}`,
          gte(skills.updatedAt, sevenDaysAgo),
          sql`${skills.updatedAt} > ${skills.createdAt} + interval '1 hour'`
        )
      );
    return result[0]?.count ?? 0;
  },

  /**
   * Count all skills (for recent pagination)
   */
  countAll: async (db: DB) => {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(and(eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md')));
    return result[0]?.count ?? 0;
  },

  /**
   * Get all skills for sitemap generation (lightweight: id, updatedAt, githubOwner only)
   */
  getAllForSitemap: async (db: DB) => {
    return db
      .select({
        id: skills.id,
        updatedAt: skills.updatedAt,
        githubOwner: skills.githubOwner,
      })
      .from(skills)
      .where(and(eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md')));
  },

  /**
   * Get site engagement level for adaptive algorithm
   * Returns: 'cold_start' | 'growth' | 'mature'
   */
  getSiteEngagementLevel: async (db: DB): Promise<'cold_start' | 'growth' | 'mature'> => {
    const stats = await db
      .select({
        totalViews: sql<number>`COALESCE(SUM(${skills.viewCount}), 0)::int`,
        totalDownloads: sql<number>`COALESCE(SUM(${skills.downloadCount}), 0)::int`,
        ratedSkills: sql<number>`COUNT(*) FILTER (WHERE ${skills.ratingCount} > 0)::int`,
      })
      .from(skills)
      .where(eq(skills.isBlocked, false));

    const totalEngagement = (stats[0]?.totalViews ?? 0) + (stats[0]?.totalDownloads ?? 0);

    if (totalEngagement < 1000) return 'cold_start';
    if (totalEngagement < 10000) return 'growth';
    return 'mature';
  },

  /**
   * Get skills by adaptive popularity score
   *
   * Algorithm adapts based on site engagement level:
   * - Cold Start: quality (50%) + freshness (30%) + engagement (20%)
   * - Growth: quality (30%) + freshness (20%) + engagement (50%)
   * - Mature: quality (20%) + freshness (10%) + engagement (70%)
   *
   * Quality = description length + security status + has content
   * Freshness = recency bonus (7d/30d/90d)
   * Engagement = views + downloads + ratings (internal SkillHub metrics)
   *
   * NOTE: GitHub stars are NOT used to avoid parent repo bias
   */
  getByPopularity: async (db: DB, limit = 10, offset = 0) => {
    // Get current engagement level
    const engagementLevel = await skillQueries.getSiteEngagementLevel(db);

    // Adaptive weights based on engagement level
    const weights = {
      cold_start: { quality: 0.5, freshness: 0.3, engagement: 0.2 },
      growth: { quality: 0.3, freshness: 0.2, engagement: 0.5 },
      mature: { quality: 0.2, freshness: 0.1, engagement: 0.7 },
    }[engagementLevel];

    // Use sql.raw() to inject numeric weights directly into SQL
    const wQuality = sql.raw(String(weights.quality));
    const wFreshness = sql.raw(String(weights.freshness));
    const wEngagement = sql.raw(String(weights.engagement));

    return db
      .select()
      .from(skills)
      .where(and(eq(skills.isBlocked, false), eq(skills.sourceFormat, 'skill.md')))
      .orderBy(
        desc(
          sql`(
            -- Quality Score (0-60 points)
            (
              CASE WHEN LENGTH(COALESCE(${skills.description}, '')) > 200 THEN 30
                   ELSE LENGTH(COALESCE(${skills.description}, '')) / 10 END +
              CASE WHEN ${skills.securityStatus} = 'pass' THEN 20 ELSE 0 END +
              CASE WHEN ${skills.rawContent} IS NOT NULL THEN 10 ELSE 0 END
            ) * ${wQuality} +

            -- Freshness Score (0-50 points)
            (
              CASE
                WHEN ${skills.updatedAt} > NOW() - INTERVAL '7 days' THEN 50
                WHEN ${skills.updatedAt} > NOW() - INTERVAL '30 days' THEN 30
                WHEN ${skills.updatedAt} > NOW() - INTERVAL '90 days' THEN 10
                ELSE 0
              END
            ) * ${wFreshness} +

            -- Engagement Score (internal SkillHub metrics only)
            (
              COALESCE(${skills.viewCount}, 0) * 0.1 +
              COALESCE(${skills.downloadCount}, 0) * 0.5 +
              COALESCE(${skills.rating}, 0) * 10 * COALESCE(${skills.ratingCount}, 0)
            ) * ${wEngagement}
          )`
        )
      )
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get featured skills with diversity constraint
   * Ensures maximum N skills from the same owner and repository
   * Uses adaptive popularity algorithm + owner/repo diversity
   */
  getFeaturedWithDiversity: async (db: DB, limit = 10, maxPerRepo = 2, maxPerOwner = 3) => {
    // Get more skills than needed to allow for diversity filtering
    const candidates = await skillQueries.getByPopularity(db, limit * 5, 0);

    // Apply diversity constraints: max N skills per repo AND per owner
    const repoCount: Record<string, number> = {};
    const ownerCount: Record<string, number> = {};
    const diverseSkills: typeof candidates = [];

    for (const skill of candidates) {
      const repoKey = `${skill.githubOwner}/${skill.githubRepo}`;
      const ownerKey = skill.githubOwner;
      const currentRepoCount = repoCount[repoKey] ?? 0;
      const currentOwnerCount = ownerCount[ownerKey] ?? 0;

      if (currentRepoCount < maxPerRepo && currentOwnerCount < maxPerOwner) {
        diverseSkills.push(skill);
        repoCount[repoKey] = currentRepoCount + 1;
        ownerCount[ownerKey] = currentOwnerCount + 1;

        if (diverseSkills.length >= limit) break;
      }
    }

    return diverseSkills;
  },

  /**
   * Upsert a skill (insert or update)
   * NOTE: When commitSha changes, cachedFiles is cleared to invalidate stale cache
   */
  upsert: async (
    db: DB,
    skill: typeof skills.$inferInsert
  ): Promise<typeof skills.$inferSelect> => {
    // Check if commitSha changed (for cache invalidation)
    let shouldClearCache = false;
    if (skill.id && skill.commitSha) {
      const existing = await db
        .select({ commitSha: skills.commitSha, cachedFiles: skills.cachedFiles })
        .from(skills)
        .where(eq(skills.id, skill.id))
        .limit(1);

      if (existing[0] && existing[0].cachedFiles && existing[0].commitSha !== skill.commitSha) {
        shouldClearCache = true;
      }
    }

    const result = await db
      .insert(skills)
      .values({
        ...skill,
        updatedAt: new Date(),
        // Clear cachedFiles if commitSha changed (on insert, it's null anyway)
        cachedFiles: shouldClearCache ? null : undefined,
      })
      .onConflictDoUpdate({
        target: skills.id,
        set: {
          name: skill.name,
          description: skill.description,
          skillPath: skill.skillPath,
          branch: skill.branch,
          version: skill.version,
          license: skill.license,
          author: skill.author,
          homepage: skill.homepage,
          compatibility: skill.compatibility,
          triggers: skill.triggers,
          githubStars: skill.githubStars,
          githubForks: skill.githubForks,
          securityScore: skill.securityScore,
          sourceFormat: skill.sourceFormat,
          contentHash: skill.contentHash,
          rawContent: skill.rawContent,
          commitSha: skill.commitSha,
          indexedAt: skill.indexedAt,
          // Note: updatedAt is managed by the database trigger (update_skills_updated_at_column)
          // which only updates it when content-related columns actually change
          // Clear cachedFiles if commitSha changed
          ...(shouldClearCache ? { cachedFiles: null } : {}),
        },
      })
      .returning();

    return result[0];
  },

  /**
   * Increment download count
   */
  incrementDownloads: async (db: DB, id: string) => {
    await db
      .update(skills)
      .set({
        downloadCount: sql`${skills.downloadCount} + 1`,
        lastDownloadedAt: new Date(),
      })
      .where(eq(skills.id, id));
  },

  /**
   * Increment view count
   */
  incrementViews: async (db: DB, id: string) => {
    await db
      .update(skills)
      .set({
        viewCount: sql`${skills.viewCount} + 1`,
      })
      .where(eq(skills.id, id));
  },

  /**
   * Update rating aggregates
   */
  updateRating: async (db: DB, skillId: string) => {
    const ratingStats = await db
      .select({
        count: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${ratings.rating}), 0)::int`,
        avg: sql<number>`round(avg(${ratings.rating}))::int`,
      })
      .from(ratings)
      .where(eq(ratings.skillId, skillId));

    if (ratingStats[0]) {
      await db
        .update(skills)
        .set({
          ratingCount: ratingStats[0].count,
          ratingSum: ratingStats[0].sum,
          rating: ratingStats[0].avg,
        })
        .where(eq(skills.id, skillId));
    }
  },

  /**
   * Block a skill from being re-indexed (for removal requests)
   */
  block: async (db: DB, id: string) => {
    await db.update(skills).set({ isBlocked: true }).where(eq(skills.id, id));
  },

  /**
   * Unblock a skill
   */
  unblock: async (db: DB, id: string) => {
    await db.update(skills).set({ isBlocked: false }).where(eq(skills.id, id));
  },

  /**
   * Check if a skill is blocked
   */
  isBlocked: async (db: DB, id: string): Promise<boolean> => {
    const result = await db
      .select({ isBlocked: skills.isBlocked })
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);
    return result[0]?.isBlocked ?? false;
  },

  /**
   * Get cached files for a skill
   * Returns null if cache doesn't exist or is stale (commitSha mismatch)
   */
  getCachedFiles: async (db: DB, id: string) => {
    const result = await db
      .select({
        cachedFiles: skills.cachedFiles,
        commitSha: skills.commitSha,
      })
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);

    const skill = result[0];
    if (!skill?.cachedFiles) return null;

    // Validate cache is still fresh (commitSha matches)
    // If database commitSha is null/empty, accept cache with 'unknown' commitSha
    const dbSha = skill.commitSha || 'unknown';
    const cacheSha = skill.cachedFiles.commitSha || 'unknown';
    if (cacheSha !== dbSha) {
      return null; // Cache is stale, needs refresh
    }

    return skill.cachedFiles;
  },

  /**
   * Update cached files for a skill
   * Uses raw postgres client with json type for proper JSONB handling
   */
  updateCachedFiles: async (
    _db: DB,
    id: string,
    cachedFiles: {
      fetchedAt: string;
      commitSha: string;
      totalSize: number;
      items: Array<{
        name: string;
        path: string;
        content: string;
        size: number;
        isBinary: boolean;
      }>;
    }
  ) => {
    // Use raw postgres client with explicit JSON type
    const client = getRawClientLocal();
    // postgres.js supports json type natively when you pass an object
    await client`UPDATE skills SET cached_files = ${client.json(cachedFiles)} WHERE id = ${id}`;
  },

  /**
   * Clear cached files for a skill (used during re-indexing)
   */
  clearCachedFiles: async (db: DB, id: string) => {
    await db
      .update(skills)
      .set({ cachedFiles: null })
      .where(eq(skills.id, id));
  },

  /**
   * Get skills by owner with pagination and sorting
   */
  getByOwner: async (
    db: DB,
    owner: string,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: 'popularity' | 'downloads' | 'stars';
      repo?: string;
    } = {}
  ) => {
    const { limit = 24, offset = 0, sortBy = 'popularity', repo } = options;

    const conditions = [eq(skills.githubOwner, owner), eq(skills.isBlocked, false)];
    if (repo) conditions.push(eq(skills.githubRepo, repo));
    const ownerCondition = and(...conditions);

    if (sortBy === 'popularity') {
      const engagementLevel = await skillQueries.getSiteEngagementLevel(db);
      const weights = {
        cold_start: { quality: 0.5, freshness: 0.3, engagement: 0.2 },
        growth: { quality: 0.3, freshness: 0.2, engagement: 0.5 },
        mature: { quality: 0.2, freshness: 0.1, engagement: 0.7 },
      }[engagementLevel];

      const wQuality = sql.raw(String(weights.quality));
      const wFreshness = sql.raw(String(weights.freshness));
      const wEngagement = sql.raw(String(weights.engagement));

      return db
        .select()
        .from(skills)
        .where(ownerCondition)
        .orderBy(
          desc(
            sql`(
              (CASE WHEN LENGTH(COALESCE(${skills.description}, '')) > 200 THEN 30
                    ELSE LENGTH(COALESCE(${skills.description}, '')) / 10 END +
               CASE WHEN ${skills.securityStatus} = 'pass' THEN 20 ELSE 0 END +
               CASE WHEN ${skills.rawContent} IS NOT NULL THEN 10 ELSE 0 END
              ) * ${wQuality} +
              (CASE
                 WHEN ${skills.updatedAt} > NOW() - INTERVAL '7 days' THEN 50
                 WHEN ${skills.updatedAt} > NOW() - INTERVAL '30 days' THEN 30
                 WHEN ${skills.updatedAt} > NOW() - INTERVAL '90 days' THEN 10
                 ELSE 0
               END
              ) * ${wFreshness} +
              (COALESCE(${skills.viewCount}, 0) * 0.1 +
               COALESCE(${skills.downloadCount}, 0) * 0.5 +
               COALESCE(${skills.rating}, 0) * 10 * COALESCE(${skills.ratingCount}, 0)
              ) * ${wEngagement}
            )`
          )
        )
        .limit(limit)
        .offset(offset);
    }

    if (sortBy === 'downloads') {
      return db
        .select()
        .from(skills)
        .where(ownerCondition)
        .orderBy(desc(skills.downloadCount), desc(skills.githubStars))
        .limit(limit)
        .offset(offset);
    }

    // stars sort
    return db
      .select()
      .from(skills)
      .where(ownerCondition)
      .orderBy(desc(skills.githubStars), desc(skills.downloadCount))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get distinct repos for an owner (for repo filter)
   */
  getOwnerRepos: async (db: DB, owner: string) => {
    return db
      .selectDistinctOn([skills.githubRepo], {
        repo: skills.githubRepo,
        stars: skills.githubStars,
        skillCount: sql<number>`count(*) OVER (PARTITION BY ${skills.githubRepo})::int`,
      })
      .from(skills)
      .where(and(eq(skills.githubOwner, owner), eq(skills.isBlocked, false)))
      .orderBy(skills.githubRepo, desc(skills.githubStars));
  },

  /**
   * Count skills by owner (for pagination), optionally filtered by repo
   */
  countByOwner: async (db: DB, owner: string, repo?: string): Promise<number> => {
    const conditions = [eq(skills.githubOwner, owner), eq(skills.isBlocked, false)];
    if (repo) conditions.push(eq(skills.githubRepo, repo));
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  },

  /**
   * Get aggregate stats for an owner
   */
  getOwnerStats: async (db: DB, owner: string) => {
    const result = await db
      .select({
        totalSkills: sql<number>`cast(count(*) as int)`,
        totalDownloads: sql<number>`COALESCE(SUM(${skills.downloadCount}), 0)::int`,
        totalViews: sql<number>`COALESCE(SUM(${skills.viewCount}), 0)::int`,
        totalRepos: sql<number>`COUNT(DISTINCT ${skills.githubRepo})::int`,
        maxStars: sql<number>`COALESCE(MAX(${skills.githubStars}), 0)::int`,
      })
      .from(skills)
      .where(and(eq(skills.githubOwner, owner), eq(skills.isBlocked, false)));

    return result[0] ?? { totalSkills: 0, totalDownloads: 0, totalViews: 0, totalRepos: 0, maxStars: 0 };
  },
};

/**
 * Category queries
 */
export const categoryQueries = {
  /**
   * Get all categories
   */
  getAll: async (db: DB) => {
    return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  },

  /**
   * Get category by slug
   */
  getBySlug: async (db: DB, slug: string) => {
    const result = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return result[0] ?? null;
  },

  /**
   * Get skills in a category
   */
  getSkills: async (db: DB, categoryId: string, limit = 20, offset = 0) => {
    return db
      .select({ skill: skills })
      .from(skillCategories)
      .innerJoin(skills, eq(skillCategories.skillId, skills.id))
      .where(eq(skillCategories.categoryId, categoryId))
      .orderBy(desc(skills.githubStars))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get all categories in hierarchical structure
   * Returns parent categories with their children nested
   */
  getHierarchical: async (db: DB) => {
    const allCats = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder));

    // Separate parents and children
    const parents = allCats.filter((c) => c.id.startsWith('parent-'));
    const children = allCats.filter((c) => !c.id.startsWith('parent-'));

    // Group children under their parents
    return parents.map((parent) => ({
      ...parent,
      children: children.filter((c) => c.parentId === parent.id),
    }));
  },

  /**
   * Get only leaf categories (no parent categories)
   * These are the categories that skills are assigned to
   */
  getLeafCategories: async (db: DB) => {
    return db
      .select()
      .from(categories)
      .where(not(like(categories.id, 'parent-%')))
      .orderBy(asc(categories.sortOrder));
  },

  /**
   * Get category by ID
   */
  getById: async (db: DB, id: string) => {
    const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0] ?? null;
  },

  /**
   * NOTE: Manual skill count updates removed - database trigger handles this automatically
   * (See init-db.sql lines 356-373: update_category_count trigger)
   */

  /**
   * Link a skill to categories based on its name and description
   * Uses keyword matching to auto-categorize skills with 16 categories
   * Keywords are ordered by specificity (most specific first to avoid false positives)
   */
  linkSkillToCategories: async (db: DB, skillId: string, skillName: string, skillDescription: string) => {
    // Categories ordered by specificity (check specific keywords first)
    const categoryKeywords: Record<string, string[]> = {
      // Tier 1: Most specific (check first)
      'cat-ai-llm': [
        'llm', 'langchain', 'llamaindex', 'openai', 'anthropic', 'claude', 'gpt', 'chatgpt',
        'huggingface', 'transformer', 'embedding', 'vector', 'rag', 'retrieval-augmented',
        'machine-learning', 'deep-learning', 'neural', 'tensorflow', 'pytorch', 'model-training',
        'nlp', 'natural-language', 'text-generation', 'sentiment', 'classification',
        'gemini', 'bard', 'mistral', 'llama', 'summarize', 'summary', 'nano-banana',
      ],
      'cat-agents': [
        'agent', 'agentic', 'multi-agent', 'autonomous', 'orchestrat', 'swarm',
        'crew', 'autogen', 'langgraph', 'tool-use', 'function-calling',
      ],
      'cat-prompts': [
        'prompt', 'prompting', 'chain-of-thought', 'few-shot', 'zero-shot',
        'instruction', 'system-prompt',
      ],
      'cat-security': [
        'security', 'auth', 'authentication', 'authorization', 'oauth', 'jwt', 'saml',
        'encrypt', 'decrypt', 'hash', 'crypto', 'ssl', 'tls', 'certificate',
        'vulnerab', 'penetration', 'pentest', 'owasp', 'xss', 'csrf',
        'iam', 'rbac', 'permission', '1password', 'lastpass', 'vault', 'secrets',
      ],
      'cat-mobile': [
        'ios', 'android', 'react-native', 'flutter', 'ionic', 'capacitor',
        'expo', 'swiftui', 'kotlin', 'mobile-app', 'app-store', 'play-store',
      ],
      'cat-mcp': [
        'mcp', 'model-context-protocol', 'skill-creator', 'superpower',
        'skillhub', 'skill.md',
      ],
      'cat-documents': [
        'pdf', 'docx', 'xlsx', 'pptx', 'csv', 'document', 'word', 'excel',
        'powerpoint', 'spreadsheet', 'presentation', 'ocr', 'text-extraction',
      ],

      // Tier 2: Still specific
      'cat-data': [
        'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
        'sqlite', 'supabase', 'firebase', 'dynamodb', 'cassandra', 'neo4j',
        'sql', 'nosql', 'orm', 'prisma', 'drizzle', 'typeorm', 'sequelize',
        'database', 'migration', 'etl', 'dbt', 'airflow', 'spark', 'bigquery',
      ],
      'cat-devops': [
        'docker', 'kubernetes', 'k8s', 'container', 'helm', 'podman',
        'aws', 'amazon-web-services', 'azure', 'gcp', 'google-cloud',
        'terraform', 'pulumi', 'ansible', 'cloudformation',
        'github-actions', 'gitlab-ci', 'jenkins', 'circleci', 'ci-cd', 'pipeline',
        'deploy', 'infrastructure', 'monitoring', 'prometheus', 'grafana',
      ],
      'cat-git': [
        'git', 'github', 'gitlab', 'bitbucket', 'branch', 'merge', 'rebase',
        'commit', 'pull-request', 'worktree', 'monorepo', 'gitflow',
      ],
      'cat-testing': [
        'jest', 'vitest', 'mocha', 'cypress', 'playwright', 'selenium', 'puppeteer',
        'test', 'testing', 'tdd', 'bdd', 'unit-test', 'integration-test', 'e2e',
        'coverage', 'mock', 'stub', 'fixture', 'debug', 'debugg', 'bug', 'fix',
      ],
      'cat-content': [
        'documentation', 'docs', 'readme', 'changelog', 'api-doc', 'jsdoc',
        'writing', 'writer', 'copywriting', 'blog', 'article', 'content',
        'translate', 'translation', 'i18n', 'localization',
      ],

      // Tier 3: Broader categories
      'cat-frontend': [
        'react', 'vue', 'svelte', 'angular', 'nextjs', 'nuxt', 'remix', 'astro',
        'tailwind', 'shadcn', 'chakra', 'material-ui', 'bootstrap',
        'frontend', 'front-end', 'responsive', 'css', 'scss',
        'component', 'layout', 'animation', 'theme', 'dark-mode',
        'godot', 'unity', 'game', 'gdscript', 'unreal', 'gamedev',
      ],
      'cat-backend': [
        'express', 'fastapi', 'django', 'flask', 'rails', 'spring', 'nestjs',
        'graphql', 'rest', 'api', 'microservice', 'middleware', 'endpoint',
        'backend', 'back-end', 'server-side', 'nodejs', 'deno', 'bun',
      ],
      'cat-languages': [
        'python', 'javascript', 'typescript', 'rust', 'golang', 'java', 'ruby',
        'php', 'swift', 'kotlin', 'cpp', 'csharp', 'dotnet', 'scala', 'elixir',
      ],

      // Tier 3.5: New specialized categories (to reduce "Other" bloat)
      'cat-productivity': [
        'bear-notes', 'grizzly', 'apple-reminders', 'remindctl', 'himalaya',
        'notes', 'note-taking', 'reminder', 'todo', 'task-manager', 'calendar',
        'schedule', 'productivity', 'notion', 'obsidian', 'roam', 'logseq',
        'evernote', 'onenote', 'org-mode', 'pkm', 'second-brain', 'zettelkasten',
        'applescript', 'jxa', 'osascript', 'automator', 'caffeine', 'macos-automation',
      ],
      'cat-iot': [
        'smart-home', 'iot', 'home-automation', 'homekit', 'hue', 'philips-hue',
        'openhue', 'sonos', 'sonoscli', 'eight-sleep', 'eightctl', 'blucli', 'bluos',
        'bluetooth', 'zigbee', 'z-wave', 'mqtt', 'home-assistant', 'homebridge',
        'rtsp', 'onvif', 'camsnap', 'camera', 'thermostat', 'sensor', 'alexa-skill',
      ],
      'cat-multimedia': [
        'spotify', 'spotify-player', 'music', 'audio', 'video', 'media-player',
        'playback', 'stream', 'ffmpeg', 'video-frames', 'gif', 'gifgrep',
        'songsee', 'spectrogram', 'podcast', 'tts', 'text-to-speech', 'speech',
        'elevenlabs', 'voice-call', 'sherpa-onnx', 'whisper', 'transcribe',
        'subtitle', 'caption', 'mp3', 'mp4', 'wav', 'youtube-dl', 'yt-dlp',
      ],
      'cat-social': [
        'twitter', 'tweet', 'bird', 'x-api', 'imsg', 'imessage', 'sms', 'message',
        'social-media', 'facebook', 'linkedin', 'instagram', 'discord-bot',
        'slack-bot', 'telegram-bot', 'whatsapp', 'reddit', 'mastodon', 'bluesky',
      ],
      'cat-business': [
        'stripe', 'payment', 'billing', 'invoice', 'subscription', 'financi',
        'startup', 'market-sizing', 'revenue', 'pricing', 'gtm', 'go-to-market',
        'competitive', 'lead-gen', 'crm', 'salesforce', 'hubspot', 'accounting',
        'quickbooks', 'expense', 'budget', 'forecast', 'valuation', 'pitch-deck',
      ],
      'cat-science': [
        'math', 'mathematics', 'calculus', 'algebra', 'geometry', 'statistics',
        'theorem', 'proof', 'lemma', 'formula', 'equation', 'integral', 'derivative',
        'lebesgue', 'hilbert', 'fourier', 'laplace', 'differential', 'linear-algebra',
        'physics', 'chemistry', 'biology', 'scientific', 'research', 'hypothesis',
        'simulation', 'cobrapy', 'metabolic', 'bioinformatics', 'genomics',
      ],
      'cat-blockchain': [
        'blockchain', 'web3', 'ethereum', 'solana', 'defi', 'nft', 'crypto',
        'smart-contract', 'token', 'dapp', 'pumpfun', 'staking', 'amm', 'governance',
        'wallet', 'metamask', 'hardhat', 'foundry', 'anchor', 'solidity', 'rust-solana',
      ],

      // Tier 4: Fallback (no keywords - only used when nothing else matches)
      'cat-other': [],
    };

    const text = `${skillName} ${skillDescription}`.toLowerCase();
    const matchedCategories: string[] = [];

    for (const [catId, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.length > 0 && keywords.some((kw) => text.includes(kw))) {
        matchedCategories.push(catId);
      }
    }

    // Default to 'cat-other' if no match (fallback category)
    if (matchedCategories.length === 0) {
      matchedCategories.push('cat-other');
    }

    // Remove existing links for this skill
    await db.delete(skillCategories).where(eq(skillCategories.skillId, skillId));

    // Add new links - BATCH INSERT (single query instead of N queries)
    if (matchedCategories.length > 0) {
      await db
        .insert(skillCategories)
        .values(matchedCategories.map((catId) => ({ skillId, categoryId: catId })))
        .onConflictDoNothing();
    }

    // No need to manually update skill counts - database trigger handles this automatically
    // (See init-db.sql lines 355-373: update_category_count trigger)

    return matchedCategories;
  },
};

/**
 * User queries
 */
export const userQueries = {
  /**
   * Get user by GitHub ID
   */
  getByGithubId: async (db: DB, githubId: string) => {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0] ?? null;
  },

  /**
   * Upsert user from GitHub OAuth
   */
  upsertFromGithub: async (
    db: DB,
    data: {
      githubId: string;
      username: string;
      displayName?: string;
      email?: string;
      avatarUrl?: string;
      preferredLocale?: string;
      isAdmin?: boolean;
    }
  ) => {
    const result = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        ...data,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          username: data.username,
          displayName: data.displayName,
          email: data.email,
          avatarUrl: data.avatarUrl,
          ...(data.preferredLocale && { preferredLocale: data.preferredLocale }),
          ...(data.isAdmin !== undefined && { isAdmin: data.isAdmin }),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  },

  /**
   * Get user's favorites
   */
  getFavorites: async (db: DB, userId: string) => {
    return db
      .select({ skill: skills })
      .from(favorites)
      .innerJoin(skills, eq(favorites.skillId, skills.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));
  },

  /**
   * Get user by database ID
   */
  getById: async (db: DB, userId: string) => {
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0] ?? null;
  },
};

/**
 * Rating queries
 */
export const ratingQueries = {
  /**
   * Add or update a rating
   */
  upsert: async (
    db: DB,
    data: {
      skillId: string;
      userId: string;
      rating: number;
      review?: string;
    }
  ) => {
    const result = await db
      .insert(ratings)
      .values({
        id: crypto.randomUUID(),
        ...data,
      })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.skillId],
        set: {
          rating: data.rating,
          review: data.review,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Update skill's aggregated rating
    await skillQueries.updateRating(db, data.skillId);

    return result[0];
  },

  /**
   * Get ratings for a skill
   */
  getForSkill: async (db: DB, skillId: string, limit = 10, offset = 0) => {
    return db
      .select({
        rating: ratings,
        user: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(ratings)
      .innerJoin(users, eq(ratings.userId, users.id))
      .where(eq(ratings.skillId, skillId))
      .orderBy(desc(ratings.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get user's rating for a specific skill
   */
  getUserRating: async (db: DB, userId: string, skillId: string) => {
    const result = await db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.skillId, skillId)))
      .limit(1);
    return result[0] ?? null;
  },
};

/**
 * Installation tracking queries
 */
export const installationQueries = {
  /**
   * Track an installation
   */
  track: async (db: DB, skillId: string, platform: string, method?: string) => {
    await db.insert(installations).values({
      id: crypto.randomUUID(),
      skillId,
      platform,
      method,
    });

    // Increment skill download count
    await skillQueries.incrementDownloads(db, skillId);
  },

  /**
   * Get installation stats for a skill
   */
  getStats: async (db: DB, skillId: string) => {
    return db
      .select({
        platform: installations.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(installations)
      .where(eq(installations.skillId, skillId))
      .groupBy(installations.platform);
  },
};

/**
 * Favorite queries
 */
export const favoriteQueries = {
  /**
   * Add a skill to user's favorites
   */
  add: async (db: DB, userId: string, skillId: string) => {
    await db
      .insert(favorites)
      .values({
        userId,
        skillId,
      })
      .onConflictDoNothing();
  },

  /**
   * Remove a skill from user's favorites
   */
  remove: async (db: DB, userId: string, skillId: string) => {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.skillId, skillId)));
  },

  /**
   * Check if a skill is favorited by user
   */
  isFavorited: async (db: DB, userId: string, skillId: string): Promise<boolean> => {
    const result = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.skillId, skillId)))
      .limit(1);
    return result.length > 0;
  },

  /**
   * Get favorited skill IDs for a user (for batch checking)
   */
  getFavoritedIds: async (db: DB, userId: string, skillIds: string[]): Promise<string[]> => {
    if (skillIds.length === 0) return [];
    const result = await db
      .select({ skillId: favorites.skillId })
      .from(favorites)
      .where(
        and(eq(favorites.userId, userId), inArray(favorites.skillId, skillIds))
      );
    return result.map((r) => r.skillId);
  },
};

/**
 * Discovered repository queries (for multi-strategy discovery)
 */
export const discoveredRepoQueries = {
  /**
   * Upsert a discovered repository
   */
  upsert: async (
    db: DB,
    repo: {
      id: string; // owner/repo
      owner: string;
      repo: string;
      discoveredVia: string;
      sourceUrl?: string;
      githubStars?: number;
      githubForks?: number;
      defaultBranch?: string;
      isArchived?: boolean;
    }
  ) => {
    const result = await db
      .insert(discoveredRepos)
      .values(repo)
      .onConflictDoUpdate({
        target: discoveredRepos.id,
        set: {
          githubStars: repo.githubStars,
          githubForks: repo.githubForks,
          defaultBranch: repo.defaultBranch,
          isArchived: repo.isArchived,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  },

  /**
   * Get a discovered repo by ID
   */
  getById: async (db: DB, id: string) => {
    const result = await db
      .select()
      .from(discoveredRepos)
      .where(eq(discoveredRepos.id, id))
      .limit(1);
    return result[0] ?? null;
  },

  /**
   * Get repos that need scanning (never scanned or scanned before date)
   */
  getNeedingScanning: async (db: DB, beforeDate?: Date, limit = 100) => {
    const conditions = [];
    if (beforeDate) {
      conditions.push(
        sql`(${discoveredRepos.lastScanned} IS NULL OR ${discoveredRepos.lastScanned} < ${beforeDate})`
      );
    } else {
      conditions.push(sql`${discoveredRepos.lastScanned} IS NULL`);
    }
    conditions.push(eq(discoveredRepos.isArchived, false));

    return db
      .select()
      .from(discoveredRepos)
      .where(and(...conditions))
      .orderBy(desc(discoveredRepos.githubStars))
      .limit(limit);
  },

  /**
   * Mark a repo as scanned
   */
  markScanned: async (
    db: DB,
    id: string,
    skillCount: number,
    hasSkillMd: boolean,
    error?: string
  ) => {
    await db
      .update(discoveredRepos)
      .set({
        lastScanned: new Date(),
        skillCount,
        hasSkillMd,
        scanError: error ?? null,
      })
      .where(eq(discoveredRepos.id, id));
  },

  /**
   * Get statistics about discovered repos
   */
  getStats: async (db: DB) => {
    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoveredRepos);

    const bySource = await db
      .select({
        source: discoveredRepos.discoveredVia,
        count: sql<number>`count(*)::int`,
        withSkills: sql<number>`sum(case when has_skill_md then 1 else 0 end)::int`,
      })
      .from(discoveredRepos)
      .groupBy(discoveredRepos.discoveredVia);

    const scanned = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoveredRepos)
      .where(sql`${discoveredRepos.lastScanned} IS NOT NULL`);

    const withSkills = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoveredRepos)
      .where(eq(discoveredRepos.hasSkillMd, true));

    return {
      total: total[0]?.count ?? 0,
      scanned: scanned[0]?.count ?? 0,
      withSkills: withSkills[0]?.count ?? 0,
      bySource,
    };
  },

  /**
   * Get all repos discovered via a specific method
   */
  getBySource: async (db: DB, source: string, limit = 1000) => {
    return db
      .select()
      .from(discoveredRepos)
      .where(eq(discoveredRepos.discoveredVia, source))
      .orderBy(desc(discoveredRepos.githubStars))
      .limit(limit);
  },

  /**
   * Check if a repo exists
   */
  exists: async (db: DB, id: string): Promise<boolean> => {
    const result = await db
      .select({ id: discoveredRepos.id })
      .from(discoveredRepos)
      .where(eq(discoveredRepos.id, id))
      .limit(1);
    return result.length > 0;
  },

  /**
   * Bulk upsert repos (for efficient batch imports)
   */
  bulkUpsert: async (
    db: DB,
    repos: Array<{
      id: string;
      owner: string;
      repo: string;
      discoveredVia: string;
      sourceUrl?: string;
      githubStars?: number;
    }>
  ) => {
    if (repos.length === 0) return 0;

    // Use INSERT ... ON CONFLICT for each repo
    let inserted = 0;
    for (const repo of repos) {
      try {
        await db
          .insert(discoveredRepos)
          .values(repo)
          .onConflictDoNothing();
        inserted++;
      } catch {
        // Skip duplicates
      }
    }
    return inserted;
  },
};

/**
 * Awesome list queries (for tracking curated lists)
 */
export const awesomeListQueries = {
  /**
   * Upsert an awesome list
   */
  upsert: async (
    db: DB,
    list: {
      id: string;
      owner: string;
      repo: string;
      name?: string;
      repoCount?: number;
    }
  ) => {
    const result = await db
      .insert(awesomeLists)
      .values(list)
      .onConflictDoUpdate({
        target: awesomeLists.id,
        set: {
          name: list.name,
          repoCount: list.repoCount,
          lastParsed: new Date(),
        },
      })
      .returning();
    return result[0];
  },

  /**
   * Get all active awesome lists
   */
  getActive: async (db: DB) => {
    return db
      .select()
      .from(awesomeLists)
      .where(eq(awesomeLists.isActive, true))
      .orderBy(desc(awesomeLists.repoCount));
  },

  /**
   * Get lists that need parsing (never parsed or parsed before date)
   */
  getNeedingParsing: async (db: DB, beforeDate?: Date) => {
    const conditions = [eq(awesomeLists.isActive, true)];
    if (beforeDate) {
      conditions.push(
        sql`(${awesomeLists.lastParsed} IS NULL OR ${awesomeLists.lastParsed} < ${beforeDate})`
      );
    } else {
      conditions.push(sql`${awesomeLists.lastParsed} IS NULL`);
    }

    return db
      .select()
      .from(awesomeLists)
      .where(and(...conditions));
  },

  /**
   * Mark a list as parsed
   */
  markParsed: async (db: DB, id: string, repoCount: number) => {
    await db
      .update(awesomeLists)
      .set({
        lastParsed: new Date(),
        repoCount,
      })
      .where(eq(awesomeLists.id, id));
  },

  /**
   * Deactivate a list (e.g., if it no longer exists)
   */
  deactivate: async (db: DB, id: string) => {
    await db
      .update(awesomeLists)
      .set({ isActive: false })
      .where(eq(awesomeLists.id, id));
  },

  /**
   * Get all lists
   */
  getAll: async (db: DB) => {
    return db.select().from(awesomeLists).orderBy(desc(awesomeLists.repoCount));
  },
};

/**
 * Removal request queries
 */
export const removalRequestQueries = {
  /**
   * Create a new removal request
   */
  create: async (
    db: DB,
    data: {
      userId: string;
      skillId: string;
      reason: string;
      verifiedOwner: boolean;
    }
  ) => {
    const id = crypto.randomUUID();
    await db.insert(removalRequests).values({
      id,
      userId: data.userId,
      skillId: data.skillId,
      reason: data.reason,
      verifiedOwner: data.verifiedOwner,
      status: 'pending',
    });
    return id;
  },

  /**
   * Get removal request by ID
   */
  getById: async (db: DB, id: string) => {
    const result = await db
      .select()
      .from(removalRequests)
      .where(eq(removalRequests.id, id))
      .limit(1);
    return result[0] ?? null;
  },

  /**
   * Get all removal requests by user
   */
  getByUser: async (db: DB, userId: string) => {
    return db
      .select()
      .from(removalRequests)
      .where(eq(removalRequests.userId, userId))
      .orderBy(desc(removalRequests.createdAt));
  },

  /**
   * Get pending removal requests for a skill
   */
  getPendingForSkill: async (db: DB, skillId: string) => {
    return db
      .select()
      .from(removalRequests)
      .where(
        and(
          eq(removalRequests.skillId, skillId),
          eq(removalRequests.status, 'pending')
        )
      );
  },

  /**
   * Get all pending requests (for admin)
   */
  getAllPending: async (db: DB) => {
    return db
      .select()
      .from(removalRequests)
      .where(eq(removalRequests.status, 'pending'))
      .orderBy(desc(removalRequests.createdAt));
  },

  /**
   * Resolve a removal request
   */
  resolve: async (
    db: DB,
    id: string,
    data: {
      status: 'approved' | 'rejected';
      resolvedBy: string;
      resolutionNote?: string;
    }
  ) => {
    await db
      .update(removalRequests)
      .set({
        status: data.status,
        resolvedBy: data.resolvedBy,
        resolvedAt: new Date(),
        resolutionNote: data.resolutionNote,
      })
      .where(eq(removalRequests.id, id));
  },

  /**
   * Check if user already has a pending request for a skill
   */
  hasPendingRequest: async (
    db: DB,
    userId: string,
    skillId: string
  ): Promise<boolean> => {
    const result = await db
      .select()
      .from(removalRequests)
      .where(
        and(
          eq(removalRequests.userId, userId),
          eq(removalRequests.skillId, skillId),
          eq(removalRequests.status, 'pending')
        )
      )
      .limit(1);
    return result.length > 0;
  },
};

/**
 * Add request queries (for skill addition requests)
 */
export const addRequestQueries = {
  /**
   * Create a new add request
   */
  create: async (
    db: DB,
    data: {
      userId: string;
      repositoryUrl: string;
      skillPath?: string;
      reason: string;
      validRepo?: boolean;
      hasSkillMd?: boolean;
    }
  ) => {
    const id = crypto.randomUUID();
    await db.insert(addRequests).values({
      id,
      userId: data.userId,
      repositoryUrl: data.repositoryUrl,
      skillPath: data.skillPath,
      reason: data.reason,
      validRepo: data.validRepo ?? false,
      hasSkillMd: data.hasSkillMd ?? false,
      status: 'pending',
    });
    return id;
  },

  /**
   * Get add request by ID
   */
  getById: async (db: DB, id: string) => {
    const result = await db
      .select()
      .from(addRequests)
      .where(eq(addRequests.id, id))
      .limit(1);
    return result[0] ?? null;
  },

  /**
   * Get all add requests by user
   */
  getByUser: async (db: DB, userId: string) => {
    return db
      .select()
      .from(addRequests)
      .where(eq(addRequests.userId, userId))
      .orderBy(desc(addRequests.createdAt));
  },

  /**
   * Get all pending add requests
   */
  getAllPending: async (db: DB) => {
    return db
      .select()
      .from(addRequests)
      .where(eq(addRequests.status, 'pending'))
      .orderBy(desc(addRequests.createdAt));
  },

  /**
   * Update add request status after processing
   */
  updateStatus: async (
    db: DB,
    id: string,
    data: {
      status: 'pending' | 'approved' | 'rejected' | 'indexed';
      indexedSkillId?: string;
      errorMessage?: string;
    }
  ) => {
    await db
      .update(addRequests)
      .set({
        status: data.status,
        processedAt: new Date(),
        indexedSkillId: data.indexedSkillId,
        errorMessage: data.errorMessage,
      })
      .where(eq(addRequests.id, id));
  },

  /**
   * Check if user already has a pending request for a repository + skill path combination
   * - If skillPath provided: check if that path is in any pending request (exact or in comma-list)
   * - If no skillPath: check if there's any pending request with no path (full scan request)
   */
  hasPendingRequest: async (
    db: DB,
    userId: string,
    repositoryUrl: string,
    skillPath?: string | null
  ): Promise<boolean> => {
    // Get all pending requests for this repo
    const pendingRequests = await db
      .select({ skillPath: addRequests.skillPath })
      .from(addRequests)
      .where(
        and(
          eq(addRequests.userId, userId),
          eq(addRequests.repositoryUrl, repositoryUrl),
          eq(addRequests.status, 'pending')
        )
      );

    if (pendingRequests.length === 0) {
      return false;
    }

    // If user is requesting full scan (no path), any pending request is a duplicate
    if (!skillPath) {
      return true;
    }

    // If user is requesting specific path, check if it's already in any pending request
    for (const req of pendingRequests) {
      if (!req.skillPath) {
        // Existing request is a full scan, so it covers this path
        return true;
      }
      // Check if the specific path is in the comma-separated list
      const existingPaths = req.skillPath.split(',').map((p) => p.trim());
      if (existingPaths.includes(skillPath)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Check if repository URL already has a pending request from any user
   */
  existsPendingForRepo: async (db: DB, repositoryUrl: string): Promise<boolean> => {
    const result = await db
      .select()
      .from(addRequests)
      .where(
        and(
          eq(addRequests.repositoryUrl, repositoryUrl),
          eq(addRequests.status, 'pending')
        )
      )
      .limit(1);
    return result.length > 0;
  },
};

/**
 * Email subscription queries
 */
export const emailSubscriptionQueries = {
  /**
   * Subscribe an email address
   */
  subscribe: async (
    db: DB,
    data: {
      email: string;
      source: string;
      marketingConsent?: boolean;
    }
  ) => {
    const result = await db
      .insert(emailSubscriptions)
      .values({
        id: crypto.randomUUID(),
        email: data.email.toLowerCase().trim(),
        source: data.source,
        marketingConsent: data.marketingConsent ?? false,
        consentDate: data.marketingConsent ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: emailSubscriptions.email,
        set: {
          source: data.source,
          marketingConsent: data.marketingConsent ?? false,
          consentDate: data.marketingConsent ? new Date() : null,
          unsubscribedAt: null, // Re-subscribe if previously unsubscribed
        },
      })
      .returning();

    return result[0];
  },

  /**
   * Unsubscribe an email address (soft delete)
   */
  unsubscribe: async (db: DB, email: string) => {
    const result = await db
      .update(emailSubscriptions)
      .set({
        unsubscribedAt: new Date(),
        marketingConsent: false,
      })
      .where(eq(emailSubscriptions.email, email.toLowerCase().trim()))
      .returning();

    return result[0] ?? null;
  },

  /**
   * Check if an email is subscribed (and not unsubscribed)
   */
  isSubscribed: async (db: DB, email: string): Promise<boolean> => {
    const result = await db
      .select()
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.email, email.toLowerCase().trim()),
          sql`${emailSubscriptions.unsubscribedAt} IS NULL`
        )
      )
      .limit(1);
    return result.length > 0;
  },

  /**
   * Get subscription by email
   */
  getByEmail: async (db: DB, email: string) => {
    const result = await db
      .select()
      .from(emailSubscriptions)
      .where(eq(emailSubscriptions.email, email.toLowerCase().trim()))
      .limit(1);
    return result[0] ?? null;
  },

  /**
   * Get all active subscribers (for newsletter sending)
   */
  getActiveSubscribers: async (db: DB, limit = 1000, offset = 0) => {
    return db
      .select()
      .from(emailSubscriptions)
      .where(sql`${emailSubscriptions.unsubscribedAt} IS NULL`)
      .orderBy(desc(emailSubscriptions.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count active subscribers
   */
  countActive: async (db: DB): Promise<number> => {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailSubscriptions)
      .where(sql`${emailSubscriptions.unsubscribedAt} IS NULL`);
    return result[0]?.count ?? 0;
  },

  /**
   * Get subscription stats by source
   */
  getStatsBySource: async (db: DB) => {
    return db
      .select({
        source: emailSubscriptions.source,
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) FILTER (WHERE ${emailSubscriptions.unsubscribedAt} IS NULL)::int`,
      })
      .from(emailSubscriptions)
      .groupBy(emailSubscriptions.source);
  },
};

