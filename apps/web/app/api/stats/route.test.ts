import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock rate limiting - must be before route import
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 120, resetAt: Date.now() + 60000 }),
  createRateLimitResponse: vi.fn(),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Mock cache - must be before route import
vi.mock('@/lib/cache', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  cacheKeys: { stats: () => 'stats' },
  cacheTTL: { stats: 3600 },
}));

// Mock the db module - must be before imports that use it
vi.mock('@skillhub/db', () => {
  return {
    createDb: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          { totalSkills: 100, totalDownloads: 5000, totalContributors: 50 },
        ]),
      }),
    })),
    skills: { downloadCount: 'download_count', githubOwner: 'github_owner' },
    categories: {},
    sql: vi.fn(() => 'mock-sql'),
  };
});

import { GET } from './route';

// Helper to create mock request
function createMockRequest(url = 'http://localhost:3000/api/stats') {
  return new NextRequest(url);
}

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return totalSkills count', async () => {
    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalSkills).toBeDefined();
    expect(typeof data.totalSkills).toBe('number');
  });

  it('should return totalDownloads sum', async () => {
    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.totalDownloads).toBeDefined();
    expect(typeof data.totalDownloads).toBe('number');
  });

  it('should return totalCategories count', async () => {
    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.totalCategories).toBeDefined();
    expect(typeof data.totalCategories).toBe('number');
  });

  it('should return totalContributors count', async () => {
    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.totalContributors).toBeDefined();
    expect(typeof data.totalContributors).toBe('number');
  });

  it('should return platforms count', async () => {
    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.platforms).toBe(5);
  });
});
