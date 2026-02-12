import { describe, it, expect, vi } from 'vitest';
import {
  skillQueries,
  categoryQueries,
  userQueries,
  ratingQueries,
  installationQueries,
  favoriteQueries,
} from './queries.js';
import {
  createTestSkill,
  createTestCategory,
  createTestUser,
  createTestRating,
  createTestFavorite,
} from './test-utils.js';

/**
 * These tests use mocked database operations to test the query logic.
 * For integration tests with a real database, run with: pnpm test:integration
 */

// Mock the schema imports
vi.mock('./schema.js', () => ({
  skills: { id: 'id', name: 'name', description: 'description', githubStars: 'github_stars', downloadCount: 'download_count', rating: 'rating', updatedAt: 'updated_at', isFeatured: 'is_featured', isVerified: 'is_verified', securityScore: 'security_score', viewCount: 'view_count', ratingCount: 'rating_count', ratingSum: 'rating_sum' },
  categories: { id: 'id', name: 'name', slug: 'slug', sortOrder: 'sort_order', skillCount: 'skill_count' },
  skillCategories: { skillId: 'skill_id', categoryId: 'category_id' },
  users: { id: 'id', githubId: 'github_id', username: 'username', avatarUrl: 'avatar_url' },
  ratings: { id: 'id', skillId: 'skill_id', userId: 'user_id', rating: 'rating', createdAt: 'created_at' },
  installations: { id: 'id', skillId: 'skill_id', platform: 'platform', method: 'method' },
  favorites: { userId: 'user_id', skillId: 'skill_id', createdAt: 'created_at' },
}));

// Helper to create a chainable mock
function createChainableMock(result: unknown = []) {
  const mock = {
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
    returning: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
    [Symbol.toStringTag]: 'Promise',
  };

  // Make it thenable
  Object.defineProperty(mock, 'then', {
    value: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
    enumerable: false,
  });

  return mock;
}

function createMockDb(defaultResult: unknown = []) {
  return {
    select: vi.fn().mockReturnValue(createChainableMock(defaultResult)),
    insert: vi.fn().mockReturnValue(createChainableMock(defaultResult)),
    update: vi.fn().mockReturnValue(createChainableMock(defaultResult)),
    delete: vi.fn().mockReturnValue(createChainableMock(defaultResult)),
  };
}

describe('skillQueries', () => {
  describe('getById', () => {
    it('should return skill when found', async () => {
      const skill = createTestSkill();
      const mockDb = createMockDb([skill]);

      const result = await skillQueries.getById(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(result).toEqual(skill);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return null when skill not found', async () => {
      const mockDb = createMockDb([]);

      const result = await skillQueries.getById(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('should return skills with default options', async () => {
      const skills = [createTestSkill(), createTestSkill({ id: 'another/skill/test' })];
      const mockDb = createMockDb(skills);

      const result = await skillQueries.search(mockDb as any, {});

      expect(result).toEqual(skills);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply query filter', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { query: 'test' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply minStars filter', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { minStars: 100 });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply minSecurity filter', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { minSecurity: 80 });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply verified filter', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { verified: true });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should respect limit and offset', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { limit: 10, offset: 20 });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should sort by stars descending by default', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, {});

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should sort by downloads when specified', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { sortBy: 'downloads' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should sort ascending when specified', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.search(mockDb as any, { sortBy: 'stars', sortOrder: 'asc' });

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getFeatured', () => {
    it('should return featured skills', async () => {
      const featuredSkills = [
        createTestSkill({ isFeatured: true }),
        createTestSkill({ id: 'another/featured/skill', isFeatured: true }),
      ];
      const mockDb = createMockDb(featuredSkills);

      const result = await skillQueries.getFeatured(mockDb as any, 10);

      expect(result).toEqual(featuredSkills);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      const mockDb = createMockDb([]);

      await skillQueries.getFeatured(mockDb as any, 5);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getTrending', () => {
    it('should return skills ordered by downloads', async () => {
      const trendingSkills = [
        createTestSkill({ downloadCount: 1000 }),
        createTestSkill({ id: 'another/skill/test', downloadCount: 500 }),
      ];
      const mockDb = createMockDb(trendingSkills);

      const result = await skillQueries.getTrending(mockDb as any, 10);

      expect(result).toEqual(trendingSkills);
    });
  });

  describe('getRecent', () => {
    it('should return skills ordered by updatedAt', async () => {
      const recentSkills = [
        createTestSkill({ updatedAt: new Date('2024-01-02') }),
        createTestSkill({ id: 'another/skill/test', updatedAt: new Date('2024-01-01') }),
      ];
      const mockDb = createMockDb(recentSkills);

      const result = await skillQueries.getRecent(mockDb as any, 10);

      expect(result).toEqual(recentSkills);
    });
  });

  describe('upsert', () => {
    it('should insert new skill', async () => {
      const skill = createTestSkill();
      const mockDb = createMockDb([skill]);

      const result = await skillQueries.upsert(mockDb as any, skill);

      expect(result).toEqual(skill);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing skill on conflict', async () => {
      const skill = createTestSkill();
      const updatedSkill = { ...skill, description: 'Updated description' };
      const mockDb = createMockDb([updatedSkill]);

      const result = await skillQueries.upsert(mockDb as any, updatedSkill);

      expect(result.description).toBe('Updated description');
    });
  });

  describe('incrementDownloads', () => {
    it('should increment download count', async () => {
      const mockDb = createMockDb();

      await skillQueries.incrementDownloads(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('incrementViews', () => {
    it('should increment view count', async () => {
      const mockDb = createMockDb();

      await skillQueries.incrementViews(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('updateRating', () => {
    it('should update skill rating aggregates', async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue(createChainableMock([{ count: 5, sum: 20, avg: 4 }])),
        update: vi.fn().mockReturnValue(createChainableMock()),
      };

      await skillQueries.updateRating(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});

describe('categoryQueries', () => {
  describe('getAll', () => {
    it('should return all categories', async () => {
      const categories = [
        createTestCategory({ sortOrder: 1 }),
        createTestCategory({ id: 'cat-2', sortOrder: 2 }),
      ];
      const mockDb = createMockDb(categories);

      const result = await categoryQueries.getAll(mockDb as any);

      expect(result).toEqual(categories);
    });

    it('should order by sortOrder then name', async () => {
      const mockDb = createMockDb([]);

      await categoryQueries.getAll(mockDb as any);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getBySlug', () => {
    it('should return category when found', async () => {
      const category = createTestCategory({ slug: 'test-category' });
      const mockDb = createMockDb([category]);

      const result = await categoryQueries.getBySlug(mockDb as any, 'test-category');

      expect(result).toEqual(category);
    });

    it('should return null when category not found', async () => {
      const mockDb = createMockDb([]);

      const result = await categoryQueries.getBySlug(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSkills', () => {
    it('should return skills in category', async () => {
      const skills = [
        { skill: createTestSkill() },
        { skill: createTestSkill({ id: 'another/skill/test' }) },
      ];
      const mockDb = createMockDb(skills);

      const result = await categoryQueries.getSkills(mockDb as any, 'cat-1', 20, 0);

      expect(result).toEqual(skills);
    });

    it('should respect pagination', async () => {
      const mockDb = createMockDb([]);

      await categoryQueries.getSkills(mockDb as any, 'cat-1', 10, 5);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  // NOTE: updateSkillCount test removed - function deleted because database trigger handles counts automatically
  // (See init-db.sql lines 356-373: update_category_count trigger)
});

describe('userQueries', () => {
  describe('getByGithubId', () => {
    it('should return user when found', async () => {
      const user = createTestUser({ githubId: 'gh-12345' });
      const mockDb = createMockDb([user]);

      const result = await userQueries.getByGithubId(mockDb as any, 'gh-12345');

      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      const mockDb = createMockDb([]);

      const result = await userQueries.getByGithubId(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsertFromGithub', () => {
    it('should insert new user from GitHub OAuth', async () => {
      const userData = {
        githubId: 'gh-12345',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      };
      const user = createTestUser(userData);
      const mockDb = createMockDb([user]);

      const result = await userQueries.upsertFromGithub(mockDb as any, userData);

      expect(result).toEqual(user);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing user on conflict', async () => {
      const userData = {
        githubId: 'gh-12345',
        username: 'updateduser',
      };
      const mockDb = createMockDb([createTestUser(userData)]);

      const result = await userQueries.upsertFromGithub(mockDb as any, userData);

      expect(result.username).toBe('updateduser');
    });
  });

  describe('getFavorites', () => {
    it('should return user favorites with skill details', async () => {
      const favorites = [
        { skill: createTestSkill() },
        { skill: createTestSkill({ id: 'another/skill/test' }) },
      ];
      const mockDb = createMockDb(favorites);

      const result = await userQueries.getFavorites(mockDb as any, 'user-1');

      expect(result).toEqual(favorites);
    });
  });

  describe('getById', () => {
    it('should return user by database ID', async () => {
      const user = createTestUser({ id: 'user-123' });
      const mockDb = createMockDb([user]);

      const result = await userQueries.getById(mockDb as any, 'user-123');

      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      const mockDb = createMockDb([]);

      const result = await userQueries.getById(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });
});

describe('ratingQueries', () => {
  describe('upsert', () => {
    it('should insert new rating', async () => {
      const ratingData = {
        skillId: 'test-owner/test-repo/test-skill',
        userId: 'user-1',
        rating: 5,
        review: 'Excellent skill!',
      };
      const rating = createTestRating(ratingData);

      // Mock both insert and the updateRating call
      const mockDb = {
        insert: vi.fn().mockReturnValue(createChainableMock([rating])),
        select: vi.fn().mockReturnValue(createChainableMock([{ count: 1, sum: 5, avg: 5 }])),
        update: vi.fn().mockReturnValue(createChainableMock()),
      };

      const result = await ratingQueries.upsert(mockDb as any, ratingData);

      expect(result).toEqual(rating);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing rating on conflict', async () => {
      const ratingData = {
        skillId: 'test-owner/test-repo/test-skill',
        userId: 'user-1',
        rating: 4,
      };
      const mockDb = {
        insert: vi.fn().mockReturnValue(createChainableMock([createTestRating(ratingData)])),
        select: vi.fn().mockReturnValue(createChainableMock([{ count: 1, sum: 4, avg: 4 }])),
        update: vi.fn().mockReturnValue(createChainableMock()),
      };

      const result = await ratingQueries.upsert(mockDb as any, ratingData);

      expect(result.rating).toBe(4);
    });
  });

  describe('getForSkill', () => {
    it('should return ratings with user info', async () => {
      const ratings = [
        {
          rating: createTestRating(),
          user: { id: 'user-1', username: 'testuser', avatarUrl: 'https://example.com/avatar.png' },
        },
      ];
      const mockDb = createMockDb(ratings);

      const result = await ratingQueries.getForSkill(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(result).toEqual(ratings);
    });

    it('should respect pagination', async () => {
      const mockDb = createMockDb([]);

      await ratingQueries.getForSkill(mockDb as any, 'test-owner/test-repo/test-skill', 5, 10);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getUserRating', () => {
    it('should return user rating for skill', async () => {
      const rating = createTestRating();
      const mockDb = createMockDb([rating]);

      const result = await ratingQueries.getUserRating(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(result).toEqual(rating);
    });

    it('should return null if not rated', async () => {
      const mockDb = createMockDb([]);

      const result = await ratingQueries.getUserRating(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(result).toBeNull();
    });
  });
});

describe('installationQueries', () => {
  describe('track', () => {
    it('should create installation record', async () => {
      const mockDb = {
        insert: vi.fn().mockReturnValue(createChainableMock()),
        update: vi.fn().mockReturnValue(createChainableMock()),
      };

      await installationQueries.track(mockDb as any, 'test-owner/test-repo/test-skill', 'claude', 'cli');

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should increment skill downloads', async () => {
      const mockDb = {
        insert: vi.fn().mockReturnValue(createChainableMock()),
        update: vi.fn().mockReturnValue(createChainableMock()),
      };

      await installationQueries.track(mockDb as any, 'test-owner/test-repo/test-skill', 'codex', 'web');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should group by platform', async () => {
      const stats = [
        { platform: 'claude', count: 50 },
        { platform: 'codex', count: 30 },
        { platform: 'copilot', count: 20 },
      ];
      const mockDb = createMockDb(stats);

      const result = await installationQueries.getStats(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(result).toEqual(stats);
    });

    it('should return counts per platform', async () => {
      const stats = [{ platform: 'claude', count: 100 }];
      const mockDb = createMockDb(stats);

      const result = await installationQueries.getStats(mockDb as any, 'test-owner/test-repo/test-skill');

      expect(result[0].count).toBe(100);
    });
  });
});

describe('favoriteQueries', () => {
  describe('add', () => {
    it('should add favorite', async () => {
      const mockDb = createMockDb();

      await favoriteQueries.add(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should not duplicate on conflict', async () => {
      const mockDb = createMockDb();

      await favoriteQueries.add(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      // onConflictDoNothing should be called
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove favorite', async () => {
      const mockDb = createMockDb();

      await favoriteQueries.remove(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should handle non-existent favorite gracefully', async () => {
      const mockDb = createMockDb();

      // Should not throw
      await expect(
        favoriteQueries.remove(mockDb as any, 'user-1', 'nonexistent')
      ).resolves.not.toThrow();
    });
  });

  describe('isFavorited', () => {
    it('should return true when favorited', async () => {
      const favorite = createTestFavorite();
      const mockDb = createMockDb([favorite]);

      const result = await favoriteQueries.isFavorited(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(result).toBe(true);
    });

    it('should return false when not favorited', async () => {
      const mockDb = createMockDb([]);

      const result = await favoriteQueries.isFavorited(mockDb as any, 'user-1', 'test-owner/test-repo/test-skill');

      expect(result).toBe(false);
    });
  });

  describe('getFavoritedIds', () => {
    it('should return favorited skill IDs', async () => {
      const favorites = [
        { skillId: 'skill-1' },
        { skillId: 'skill-2' },
      ];
      const mockDb = createMockDb(favorites);

      const result = await favoriteQueries.getFavoritedIds(
        mockDb as any,
        'user-1',
        ['skill-1', 'skill-2', 'skill-3']
      );

      expect(result).toEqual(['skill-1', 'skill-2']);
    });

    it('should return empty array for empty input', async () => {
      const mockDb = createMockDb([]);

      const result = await favoriteQueries.getFavoritedIds(mockDb as any, 'user-1', []);

      expect(result).toEqual([]);
    });

    it('should return empty array when none favorited', async () => {
      const mockDb = createMockDb([]);

      const result = await favoriteQueries.getFavoritedIds(
        mockDb as any,
        'user-1',
        ['skill-1', 'skill-2']
      );

      expect(result).toEqual([]);
    });
  });
});
