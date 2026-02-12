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
  cacheKeys: { categories: () => 'categories' },
  cacheTTL: { categories: 43200 },
}));

// Create mock category helper
function createMockCategory(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  skillCount: number | null;
  sortOrder: number | null;
  color: string | null;
  parentId: string | null;
}> = {}) {
  return {
    id: 'cat-1',
    name: 'Test Category',
    slug: 'test-category',
    description: 'A test category',
    icon: 'folder',
    color: '#3B82F6',
    skillCount: 10,
    sortOrder: 0,
    parentId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// Mock the db module
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  categoryQueries: {
    getLeafCategories: vi.fn(),
  },
}));

import { GET } from './route';
// Import after mocking
import { categoryQueries } from '@skillhub/db';

// Helper to create mock request
function createMockRequest(url = 'http://localhost:3000/api/categories') {
  return new NextRequest(url);
}

describe('GET /api/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all categories', async () => {
    const mockCategories = [
      createMockCategory({ id: 'cat-1', name: 'Development', slug: 'development', skillCount: 20 }),
      createMockCategory({ id: 'cat-2', name: 'Testing', slug: 'testing', skillCount: 15 }),
    ];
    vi.mocked(categoryQueries.getLeafCategories).mockResolvedValue(mockCategories);

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories.length).toBe(2);
  });

  it('should include skillCount for each category', async () => {
    const mockCategories = [
      createMockCategory({ skillCount: 25 }),
    ];
    vi.mocked(categoryQueries.getLeafCategories).mockResolvedValue(mockCategories);

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.categories[0].skillCount).toBeDefined();
    expect(typeof data.categories[0].skillCount).toBe('number');
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(categoryQueries.getLeafCategories).mockRejectedValue(new Error('Database error'));

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('should return empty array when no categories exist', async () => {
    vi.mocked(categoryQueries.getLeafCategories).mockResolvedValue([]);

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories.length).toBe(0);
  });
});
