import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Skills table - main entity storing indexed skills
 */
export const skills = pgTable(
  'skills',
  {
    // Primary key: owner/repo/skill-name
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),

    // Source information
    githubOwner: text('github_owner').notNull(),
    githubRepo: text('github_repo').notNull(),
    skillPath: text('skill_path').notNull(),
    branch: text('branch').default('main'),
    commitSha: text('commit_sha'),

    // Source format (which platform's instruction file format)
    sourceFormat: text('source_format').default('skill.md'),

    // Metadata
    version: text('version'),
    license: text('license'),
    author: text('author'),
    homepage: text('homepage'),
    compatibility: jsonb('compatibility').$type<{
      platforms?: string[];
      requires?: string[];
      minVersion?: string;
    }>(),
    triggers: jsonb('triggers').$type<{
      filePatterns?: string[];
      keywords?: string[];
      languages?: string[];
    }>(),

    // Quality signals
    githubStars: integer('github_stars').default(0),
    githubForks: integer('github_forks').default(0),
    downloadCount: integer('download_count').default(0),
    viewCount: integer('view_count').default(0),

    // Ratings
    rating: integer('rating'), // 1-5 average
    ratingCount: integer('rating_count').default(0),
    ratingSum: integer('rating_sum').default(0),

    // Security
    securityScore: integer('security_score'), // 0-100 (deprecated, use securityStatus)
    securityStatus: text('security_status').$type<'pass' | 'warning' | 'fail'>(), // PASS, WARNING, FAIL
    isVerified: boolean('is_verified').default(false),
    isFeatured: boolean('is_featured').default(false),
    isBlocked: boolean('is_blocked').default(false), // Blocked from re-indexing (owner requested removal)
    lastScanned: timestamp('last_scanned'),

    // Content (cached)
    contentHash: text('content_hash'),
    rawContent: text('raw_content'),

    // Cached skill files (populated on first download)
    cachedFiles: jsonb('cached_files').$type<{
      fetchedAt: string;       // ISO timestamp when files were fetched
      commitSha: string;       // Git commit SHA for cache invalidation
      totalSize: number;       // Total size in bytes
      items: Array<{
        name: string;          // e.g., "SKILL.md", "setup.sh"
        path: string;          // Relative path from skill root
        content: string;       // File content (base64 for binary)
        size: number;          // File size in bytes
        isBinary: boolean;     // Whether content is base64 encoded
      }>;
    }>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at'),
    lastDownloadedAt: timestamp('last_downloaded_at'),
  },
  (table) => ({
    nameIdx: index('idx_skills_name').on(table.name),
    ownerIdx: index('idx_skills_owner').on(table.githubOwner),
    starsIdx: index('idx_skills_stars').on(table.githubStars),
    securityIdx: index('idx_skills_security').on(table.securityScore),
    securityStatusIdx: index('idx_skills_security_status').on(table.securityStatus),
    verifiedIdx: index('idx_skills_verified').on(table.isVerified),
    featuredIdx: index('idx_skills_featured').on(table.isFeatured),
    blockedIdx: index('idx_skills_blocked').on(table.isBlocked),
    updatedIdx: index('idx_skills_updated').on(table.updatedAt),
    sourceFormatIdx: index('idx_skills_source_format').on(table.sourceFormat),
    lastDownloadedIdx: index('idx_skills_last_downloaded').on(table.lastDownloadedAt),
  })
);

/**
 * Categories for organizing skills
 */
export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    icon: text('icon'),
    color: text('color'),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').default(0),
    skillCount: integer('skill_count').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('idx_categories_slug').on(table.slug),
  })
);

/**
 * Many-to-many relationship between skills and categories
 */
export const skillCategories = pgTable(
  'skill_categories',
  {
    skillId: text('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: text('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.skillId, table.categoryId] }),
    skillIdx: index('idx_skill_categories_skill').on(table.skillId),
    categoryIdx: index('idx_skill_categories_category').on(table.categoryId),
  })
);

/**
 * Users (authenticated via GitHub OAuth)
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    githubId: text('github_id').unique().notNull(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    preferredLocale: text('preferred_locale'),
    isAdmin: boolean('is_admin').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at'),
  },
  (table) => ({
    githubIdx: uniqueIndex('idx_users_github').on(table.githubId),
    usernameIdx: index('idx_users_username').on(table.username),
  })
);

/**
 * User ratings and reviews for skills
 */
export const ratings = pgTable(
  'ratings',
  {
    id: text('id').primaryKey(),
    skillId: text('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    rating: integer('rating').notNull(), // 1-5
    review: text('review'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    skillIdx: index('idx_ratings_skill').on(table.skillId),
    userIdx: index('idx_ratings_user').on(table.userId),
    userSkillIdx: uniqueIndex('idx_ratings_user_skill').on(table.userId, table.skillId),
  })
);

/**
 * Anonymous installation tracking
 */
export const installations = pgTable(
  'installations',
  {
    id: text('id').primaryKey(),
    skillId: text('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    platform: text('platform').notNull(), // claude, codex, copilot
    method: text('method'), // cli, web, desktop
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    skillIdx: index('idx_installations_skill').on(table.skillId),
    platformIdx: index('idx_installations_platform').on(table.platform),
    createdIdx: index('idx_installations_created').on(table.createdAt),
  })
);

/**
 * User favorites/bookmarks
 */
export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    skillId: text('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.skillId] }),
    userIdx: index('idx_favorites_user').on(table.userId),
    skillIdx: index('idx_favorites_skill').on(table.skillId),
  })
);

/**
 * Indexing job queue status
 */
export const indexingJobs = pgTable(
  'indexing_jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(), // full-crawl, incremental, single-skill
    status: text('status').notNull(), // pending, running, completed, failed
    skillId: text('skill_id'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    error: text('error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('idx_indexing_jobs_status').on(table.status),
    typeIdx: index('idx_indexing_jobs_type').on(table.type),
  })
);

/**
 * Discovered repositories - tracks repos found by various discovery strategies
 * Used to queue repos for deep scanning and track discovery sources
 */
export const discoveredRepos = pgTable(
  'discovered_repos',
  {
    id: text('id').primaryKey(), // owner/repo
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    discoveredVia: text('discovered_via').notNull(), // 'awesome-list', 'topic-search', 'fork', 'org-scan', 'code-search'
    sourceUrl: text('source_url'), // URL of the awesome list or search query that found this repo
    lastScanned: timestamp('last_scanned'),
    skillCount: integer('skill_count').default(0),
    hasSkillMd: boolean('has_skill_md').default(false),
    githubStars: integer('github_stars').default(0),
    githubForks: integer('github_forks').default(0),
    defaultBranch: text('default_branch').default('main'),
    isArchived: boolean('is_archived').default(false),
    scanError: text('scan_error'), // Last scan error if any
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_discovered_repos_owner').on(table.owner),
    discoveredViaIdx: index('idx_discovered_repos_discovered_via').on(table.discoveredVia),
    lastScannedIdx: index('idx_discovered_repos_last_scanned').on(table.lastScanned),
    skillCountIdx: index('idx_discovered_repos_skill_count').on(table.skillCount),
    hasSkillMdIdx: index('idx_discovered_repos_has_skill_md').on(table.hasSkillMd),
  })
);


/**
 * Awesome lists - tracks curated lists that we crawl for repo discovery
 */
export const awesomeLists = pgTable(
  'awesome_lists',
  {
    id: text('id').primaryKey(), // owner/repo
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    name: text('name'),
    lastParsed: timestamp('last_parsed'),
    repoCount: integer('repo_count').default(0), // Number of repos found in this list
    isActive: boolean('is_active').default(true), // Whether to continue crawling this list
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    lastParsedIdx: index('idx_awesome_lists_last_parsed').on(table.lastParsed),
  })
);

/**
 * Removal requests - allows repo owners to request their skills be removed
 */
export const removalRequests = pgTable(
  'removal_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    skillId: text('skill_id').notNull(), // Can reference non-existent skill if already removed
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'), // pending, approved, rejected
    verifiedOwner: boolean('verified_owner').default(false), // GitHub API verification result
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolutionNote: text('resolution_note'),
  },
  (table) => ({
    userIdx: index('idx_removal_requests_user').on(table.userId),
    skillIdx: index('idx_removal_requests_skill').on(table.skillId),
    statusIdx: index('idx_removal_requests_status').on(table.status),
  })
);

/**
 * Add requests - allows users to request new skills be indexed
 */
export const addRequests = pgTable(
  'add_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    repositoryUrl: text('repository_url').notNull(), // Full GitHub URL
    skillPath: text('skill_path'), // Optional path within repo (for subfolder skills)
    reason: text('reason').notNull(), // Why should this skill be added
    status: text('status').notNull().default('pending'), // pending, approved, rejected, indexed
    validRepo: boolean('valid_repo').default(false), // GitHub API validation result
    hasSkillMd: boolean('has_skill_md').default(false), // Whether SKILL.md was found
    createdAt: timestamp('created_at').defaultNow().notNull(),
    processedAt: timestamp('processed_at'),
    indexedSkillId: text('indexed_skill_id'), // Reference to skill if successfully indexed
    errorMessage: text('error_message'), // Error if indexing failed
  },
  (table) => ({
    userIdx: index('idx_add_requests_user').on(table.userId),
    statusIdx: index('idx_add_requests_status').on(table.status),
    repoIdx: index('idx_add_requests_repo').on(table.repositoryUrl),
  })
);

// Relations
export const skillsRelations = relations(skills, ({ many }) => ({
  categories: many(skillCategories),
  ratings: many(ratings),
  installations: many(installations),
  favorites: many(favorites),
}));

export const categoriesRelations = relations(categories, ({ many, one }) => ({
  skills: many(skillCategories),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
}));

export const skillCategoriesRelations = relations(skillCategories, ({ one }) => ({
  skill: one(skills, {
    fields: [skillCategories.skillId],
    references: [skills.id],
  }),
  category: one(categories, {
    fields: [skillCategories.categoryId],
    references: [categories.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  ratings: many(ratings),
  favorites: many(favorites),
  removalRequests: many(removalRequests),
  addRequests: many(addRequests),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  skill: one(skills, {
    fields: [ratings.skillId],
    references: [skills.id],
  }),
  user: one(users, {
    fields: [ratings.userId],
    references: [users.id],
  }),
}));

export const installationsRelations = relations(installations, ({ one }) => ({
  skill: one(skills, {
    fields: [installations.skillId],
    references: [skills.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  skill: one(skills, {
    fields: [favorites.skillId],
    references: [skills.id],
  }),
}));

export const removalRequestsRelations = relations(removalRequests, ({ one }) => ({
  user: one(users, {
    fields: [removalRequests.userId],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [removalRequests.resolvedBy],
    references: [users.id],
  }),
}));

export const addRequestsRelations = relations(addRequests, ({ one }) => ({
  user: one(users, {
    fields: [addRequests.userId],
    references: [users.id],
  }),
}));

/**
 * Email subscriptions for newsletter and marketing emails
 */
export const emailSubscriptions = pgTable(
  'email_subscriptions',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    source: text('source').notNull(), // 'oauth', 'newsletter', 'claim', 'early-access'
    marketingConsent: boolean('marketing_consent').default(false),
    consentDate: timestamp('consent_date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    unsubscribedAt: timestamp('unsubscribed_at'),
  },
  (table) => ({
    emailIdx: uniqueIndex('idx_email_subscriptions_email').on(table.email),
    sourceIdx: index('idx_email_subscriptions_source').on(table.source),
  })
);
