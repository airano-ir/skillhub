import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Helper to create mock skill
function createMockSkill(overrides: Partial<{
  id: string;
  rating: number;
  ratingCount: number;
}> = {}) {
  return {
    id: 'test-owner/test-repo/test-skill',
    name: 'test-skill',
    rating: 4,
    ratingCount: 10,
    ...overrides,
  };
}

// Helper to create mock user
function createMockUser(overrides: Partial<{ id: string; githubId: string; username: string }> = {}) {
  return {
    id: 'user-123',
    githubId: 'gh-12345',
    username: 'testuser',
    avatarUrl: 'https://example.com/avatar.png',
    ...overrides,
  };
}

// Helper to create mock rating
function createMockRating(overrides: Partial<{
  id: string;
  rating: number;
  review: string;
}> = {}) {
  return {
    id: 'rating-1',
    skillId: 'test-owner/test-repo/test-skill',
    userId: 'user-123',
    rating: 4,
    review: 'Great skill!',
    createdAt: new Date(),
    updatedAt: new Date(),
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
  },
  skillQueries: {
    getById: vi.fn(),
  },
  ratingQueries: {
    getForSkill: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { GET, POST } from './route';
import { userQueries, skillQueries, ratingQueries } from '@skillhub/db';

describe('/api/ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    const createRequest = (searchParams: Record<string, string> = {}) => {
      const url = new URL('http://localhost:3000/api/ratings');
      Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      return new NextRequest(url);
    };

    it('should return 400 when skillId missing', async () => {
      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('skillId');
    });

    it('should return ratings for skill', async () => {
      const mockSkill = createMockSkill();
      const mockRatings = [
        {
          rating: createMockRating({ id: 'rating-1' }),
          user: createMockUser(),
        },
      ];

      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.getForSkill).mockResolvedValue(mockRatings as any);

      const request = createRequest({ skillId: 'test-owner/test-repo/test-skill' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ratings).toBeDefined();
      expect(Array.isArray(data.ratings)).toBe(true);
    });

    it('should include user info', async () => {
      const mockSkill = createMockSkill();
      const mockRatings = [
        {
          rating: createMockRating(),
          user: createMockUser({ username: 'testuser' }),
        },
      ];

      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.getForSkill).mockResolvedValue(mockRatings as any);

      const request = createRequest({ skillId: 'test-owner/test-repo/test-skill' });
      const response = await GET(request);
      const data = await response.json();

      expect(data.ratings[0].user).toBeDefined();
      expect(data.ratings[0].user.username).toBe('testuser');
    });

    it('should include rating summary', async () => {
      const mockSkill = createMockSkill({ rating: 4, ratingCount: 10 });
      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.getForSkill).mockResolvedValue([]);

      const request = createRequest({ skillId: 'test-owner/test-repo/test-skill' });
      const response = await GET(request);
      const data = await response.json();

      expect(data.summary).toBeDefined();
      expect(data.summary.average).toBe(4);
      expect(data.summary.count).toBe(10);
    });

    it('should respect pagination', async () => {
      const mockSkill = createMockSkill();
      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.getForSkill).mockResolvedValue([]);

      const request = createRequest({
        skillId: 'test-owner/test-repo/test-skill',
        limit: '5',
        offset: '10',
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ratingQueries.getForSkill).toHaveBeenCalledWith(
        expect.anything(),
        'test-owner/test-repo/test-skill',
        5,
        10
      );
    });
  });

  describe('POST', () => {
    const createRequest = (body: unknown) => {
      return new NextRequest('http://localhost:3000/api/ratings', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    };

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = createRequest({ skillId: 'test-skill', rating: 5 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when skillId missing', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });

      const request = createRequest({ rating: 5 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('skillId');
    });

    it('should return 400 when rating invalid', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });

      const request = createRequest({ skillId: 'test-skill', rating: 6 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('between 1 and 5');
    });

    it('should return 400 when rating is zero', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });

      const request = createRequest({ skillId: 'test-skill', rating: 0 });
      const response = await POST(request);
      await response.json();

      expect(response.status).toBe(400);
    });

    it('should return 404 when skill not found', async () => {
      const mockUser = createMockUser();
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.getById).mockResolvedValue(null as any);

      const request = createRequest({ skillId: 'nonexistent', rating: 5 });
      const response = await POST(request);
      await response.json();

      expect(response.status).toBe(404);
    });

    it('should create rating successfully', async () => {
      const mockUser = createMockUser();
      const mockSkill = createMockSkill();
      const mockRating = createMockRating({ rating: 5 });

      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.upsert).mockResolvedValue(mockRating as any);

      const request = createRequest({
        skillId: 'test-owner/test-repo/test-skill',
        rating: 5,
        review: 'Excellent!',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.rating).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    it('should update existing rating', async () => {
      const mockUser = createMockUser();
      const mockSkill = createMockSkill({ rating: 4, ratingCount: 1 });
      const mockRating = createMockRating({ rating: 4 });

      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.getById).mockResolvedValue(mockSkill as any);
      vi.mocked(ratingQueries.upsert).mockResolvedValue(mockRating as any);

      const request = createRequest({
        skillId: 'test-owner/test-repo/test-skill',
        rating: 4,
      });
      const response = await POST(request);
      await response.json();

      expect(response.status).toBe(200);
      expect(ratingQueries.upsert).toHaveBeenCalled();
    });
  });
});
