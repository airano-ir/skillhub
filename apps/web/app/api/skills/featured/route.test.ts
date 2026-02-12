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
  isFeatured: boolean;
  githubStars: number;
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
    isFeatured: true,
    compatibility: { platforms: ['claude'] },
    ...overrides,
  };
}

// Mock db
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  skillQueries: {
    getFeatured: vi.fn(),
    getByPopularity: vi.fn(),
    getFeaturedWithDiversity: vi.fn(),
  },
  skills: {},
}));

import { GET } from './route';
import { skillQueries } from '@skillhub/db';

describe('GET /api/skills/featured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return featured skills', async () => {
    const mockSkills = [
      createMockSkill({ id: 'skill-1', isFeatured: true }),
      createMockSkill({ id: 'skill-2', isFeatured: true }),
    ];
    vi.mocked(skillQueries.getFeatured).mockResolvedValue(mockSkills as any);

    const request = new NextRequest('http://localhost:3000/api/skills/featured');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBe(2);
  });

  it('should respect limit parameter', async () => {
    const mockSkills = [createMockSkill()];
    vi.mocked(skillQueries.getFeatured).mockResolvedValue(mockSkills as any);

    const request = new NextRequest('http://localhost:3000/api/skills/featured?limit=5');
    await GET(request);

    expect(skillQueries.getFeatured).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it('should fallback to diversity-based popularity when no featured', async () => {
    vi.mocked(skillQueries.getFeatured).mockResolvedValue([]);
    vi.mocked(skillQueries.getFeaturedWithDiversity).mockResolvedValue([createMockSkill()] as any);

    const request = new NextRequest('http://localhost:3000/api/skills/featured');
    const response = await GET(request);
    const data = await response.json();

    expect(skillQueries.getFeaturedWithDiversity).toHaveBeenCalled();
    expect(data.skills.length).toBeGreaterThan(0);
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(skillQueries.getFeatured).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/skills/featured');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
