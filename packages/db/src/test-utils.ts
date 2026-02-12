/**
 * Test utilities for @skillhub/db package
 *
 * Factory functions and helpers for creating test data
 */

import type { skills, categories, users, ratings, favorites, installations } from './schema.js';

type SkillInsert = typeof skills.$inferInsert;
type CategoryInsert = typeof categories.$inferInsert;
type UserInsert = typeof users.$inferInsert;
type RatingInsert = typeof ratings.$inferInsert;
type FavoriteInsert = typeof favorites.$inferInsert;
type InstallationInsert = typeof installations.$inferInsert;

/**
 * Create a test skill with sensible defaults
 */
export function createTestSkill(overrides: Partial<SkillInsert> = {}): SkillInsert {
  const id = overrides.id || 'test-owner/test-repo/test-skill';
  return {
    id,
    name: 'test-skill',
    description: 'A test skill for unit testing',
    githubOwner: 'test-owner',
    githubRepo: 'test-repo',
    skillPath: 'skills/test-skill',
    branch: 'main',
    version: '1.0.0',
    license: 'MIT',
    author: 'Test Author',
    compatibility: {
      platforms: ['claude', 'codex'],
    },
    githubStars: 100,
    githubForks: 10,
    downloadCount: 50,
    viewCount: 200,
    rating: 4,
    ratingCount: 5,
    ratingSum: 20,
    securityScore: 85,
    isVerified: false,
    isFeatured: false,
    rawContent: '# Test Skill\n\nThis is a test skill.',
    contentHash: 'abc123',
    createdAt: new Date(),
    updatedAt: new Date(),
    indexedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test category with sensible defaults
 */
export function createTestCategory(overrides: Partial<CategoryInsert> = {}): CategoryInsert {
  const id = overrides.id || `cat-${Date.now()}`;
  return {
    id,
    name: 'Test Category',
    slug: overrides.slug || `test-category-${Date.now()}`,
    description: 'A test category',
    icon: 'folder',
    color: '#3B82F6',
    sortOrder: 0,
    skillCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test user with sensible defaults
 */
export function createTestUser(overrides: Partial<UserInsert> = {}): UserInsert {
  const id = overrides.id || `user-${Date.now()}`;
  return {
    id,
    githubId: overrides.githubId || `gh-${Date.now()}`,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    bio: 'A test user',
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test rating with sensible defaults
 */
export function createTestRating(overrides: Partial<RatingInsert> = {}): RatingInsert {
  return {
    id: overrides.id || `rating-${Date.now()}`,
    skillId: 'test-owner/test-repo/test-skill',
    userId: 'user-1',
    rating: 4,
    review: 'Great skill!',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test favorite with sensible defaults
 */
export function createTestFavorite(overrides: Partial<FavoriteInsert> = {}): FavoriteInsert {
  return {
    userId: 'user-1',
    skillId: 'test-owner/test-repo/test-skill',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test installation with sensible defaults
 */
export function createTestInstallation(overrides: Partial<InstallationInsert> = {}): InstallationInsert {
  return {
    id: overrides.id || `install-${Date.now()}`,
    skillId: 'test-owner/test-repo/test-skill',
    platform: 'claude',
    method: 'cli',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock database type for testing
 * This provides a mock implementation of the database client
 */
export interface MockDb {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

/**
 * Create a chainable mock for database operations
 */
export function createMockDbChain(finalResult: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const createChainedMock = (): ReturnType<typeof vi.fn> => {
    const mock = vi.fn().mockImplementation(() => {
      return new Proxy({}, {
        get: (_target, prop: string) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => resolve(finalResult);
          }
          if (!chain[prop]) {
            chain[prop] = createChainedMock();
          }
          return chain[prop];
        },
      });
    });
    return mock;
  };

  return {
    select: createChainedMock(),
    insert: createChainedMock(),
    update: createChainedMock(),
    delete: createChainedMock(),
  };
}

/**
 * Create a simple mock database for unit tests
 */
export function createMockDb() {
  const mockResult: unknown[] = [];

  const createChained = () => {
    const chained = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(mockResult),
      then: (resolve: (v: unknown) => void) => Promise.resolve(mockResult).then(resolve),
    };
    return chained;
  };

  return {
    select: vi.fn().mockReturnValue(createChained()),
    insert: vi.fn().mockReturnValue(createChained()),
    update: vi.fn().mockReturnValue(createChained()),
    delete: vi.fn().mockReturnValue(createChained()),
    _setMockResult: (result: unknown[]) => {
      mockResult.length = 0;
      mockResult.push(...result);
    },
  };
}
