import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock rate limiting - must be before route import
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 120, resetAt: Date.now() + 60000 }),
  createRateLimitResponse: vi.fn(),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Helper to create mock skill
function createMockSkill(overrides: Partial<{
  id: string;
  name: string;
  description: string;
}> = {}) {
  return {
    id: 'test-owner/test-repo/test-skill',
    name: 'test-skill',
    description: 'A test skill',
    githubOwner: 'test-owner',
    githubRepo: 'test-repo',
    githubStars: 100,
    downloadCount: 50,
    securityScore: 85,
    isVerified: false,
    compatibility: { platforms: ['claude'] },
    rating: 4,
    ratingCount: 5,
    ...overrides,
  };
}

// Helper to create mock user
function createMockUser(overrides: Partial<{ id: string; githubId: string }> = {}) {
  return {
    id: 'user-123',
    githubId: 'gh-12345',
    username: 'testuser',
    ...overrides,
  };
}

// Mock auth
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock db
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  userQueries: {
    getByGithubId: vi.fn(),
    getFavorites: vi.fn(),
  },
  skillQueries: {
    getById: vi.fn(),
  },
  favoriteQueries: {
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

import { GET, POST, DELETE } from './route';
import { userQueries, skillQueries, favoriteQueries } from '@skillhub/db';

// Helper to create mock GET request
function createMockGetRequest() {
  return new NextRequest('http://localhost:3000/api/favorites');
}

describe('/api/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET(createMockGetRequest());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return empty array for new user', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(null as any);

      const response = await GET(createMockGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.favorites).toEqual([]);
    });

    it('should return user favorites', async () => {
      const mockUser = createMockUser();
      const mockFavorites = [
        { skill: createMockSkill({ id: 'skill-1' }) },
        { skill: createMockSkill({ id: 'skill-2' }) },
      ];

      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(userQueries.getFavorites).mockResolvedValue(mockFavorites as any);

      const response = await GET(createMockGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.favorites).toHaveLength(2);
    });
  });

  describe('POST', () => {
    const createRequest = (body: unknown) => {
      return new NextRequest('http://localhost:3000/api/favorites', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    };

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = createRequest({ skillId: 'test-skill' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when skillId missing', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });

      const request = createRequest({});
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('skillId');
    });

    it('should return 404 when skill not found', async () => {
      const mockUser = createMockUser();
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.getById).mockResolvedValue(null as any);

      const request = createRequest({ skillId: 'nonexistent' });
      const response = await POST(request);
      await response.json();

      expect(response.status).toBe(404);
    });

    it('should add favorite successfully', async () => {
      const mockUser = createMockUser();
      const mockSkill = createMockSkill();
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(favoriteQueries.add).mockResolvedValue(undefined);

      const request = createRequest({ skillId: 'test-owner/test-repo/test-skill' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.favorited).toBe(true);
    });
  });

  describe('DELETE', () => {
    const createRequest = (body: unknown) => {
      return new NextRequest('http://localhost:3000/api/favorites', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    };

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = createRequest({ skillId: 'test-skill' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when skillId missing', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });

      const request = createRequest({});
      const response = await DELETE(request);
      await response.json();

      expect(response.status).toBe(400);
    });

    it('should remove favorite successfully', async () => {
      const mockUser = createMockUser();
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(favoriteQueries.remove).mockResolvedValue(undefined);

      const request = createRequest({ skillId: 'test-owner/test-repo/test-skill' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.favorited).toBe(false);
    });
  });
});
