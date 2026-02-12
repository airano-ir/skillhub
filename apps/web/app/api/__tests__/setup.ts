/**
 * Test setup for API route tests
 *
 * This file is loaded before each test file via vitest setupFiles
 */

import { vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.AUTH_SECRET = 'test-auth-secret';

// Mock @skillhub/db module
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  skillQueries: {
    getById: vi.fn(),
    search: vi.fn(),
    getFeatured: vi.fn(),
    getTrending: vi.fn(),
    getRecent: vi.fn(),
    upsert: vi.fn(),
    incrementDownloads: vi.fn(),
    incrementViews: vi.fn(),
    updateRating: vi.fn(),
  },
  categoryQueries: {
    getAll: vi.fn(),
    getBySlug: vi.fn(),
    getSkills: vi.fn(),
    updateSkillCount: vi.fn(),
  },
  userQueries: {
    getByGithubId: vi.fn(),
    upsertFromGithub: vi.fn(),
    getFavorites: vi.fn(),
    getById: vi.fn(),
  },
  ratingQueries: {
    upsert: vi.fn(),
    getForSkill: vi.fn(),
    getUserRating: vi.fn(),
  },
  favoriteQueries: {
    add: vi.fn(),
    remove: vi.fn(),
    isFavorited: vi.fn(),
    getFavoritedIds: vi.fn(),
  },
  installationQueries: {
    track: vi.fn(),
    getStats: vi.fn(),
  },
  skills: {},
  categories: {},
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join('?'),
    values,
  })),
}));
