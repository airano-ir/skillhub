/**
 * Test helpers for API route tests
 */

import { vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    searchParams?: Record<string, string>;
  }
): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams = {} } = options || {};

  // Build URL with search params
  const urlObj = new URL(url, 'http://localhost:3000');
  Object.entries(searchParams).forEach(([key, value]) => {
    urlObj.searchParams.set(key, value);
  });

  const requestInit: { method: string; headers: Headers; body?: string } = {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
  };

  if (body && method !== 'GET') {
    requestInit.body = JSON.stringify(body);
  }

  // Cast to any to avoid Next.js RequestInit vs global RequestInit type mismatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(urlObj, requestInit as any);
}

/**
 * Mock authenticated session
 */
export function mockAuthSession(user?: {
  githubId: string;
  username: string;
  email?: string;
  avatarUrl?: string;
}) {
  const mockAuth = vi.fn().mockResolvedValue(
    user
      ? {
          user: {
            ...user,
            name: user.username,
          },
        }
      : null
  );

  vi.doMock('@/lib/auth', () => ({
    auth: mockAuth,
  }));

  return mockAuth;
}

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides: Partial<{
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
}> = {}) {
  return {
    id: 'user-123',
    githubId: 'gh-12345',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock skill for testing
 */
export function createMockSkill(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  githubOwner: string;
  githubRepo: string;
  githubStars: number;
  downloadCount: number;
  securityScore: number;
  isVerified: boolean;
  isFeatured: boolean;
  rating: number;
  ratingCount: number;
  compatibility: { platforms?: string[] };
}> = {}) {
  return {
    id: 'test-owner/test-repo/test-skill',
    name: 'test-skill',
    description: 'A test skill',
    githubOwner: 'test-owner',
    githubRepo: 'test-repo',
    skillPath: 'skills/test-skill',
    branch: 'main',
    version: '1.0.0',
    license: 'MIT',
    author: 'Test Author',
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
    compatibility: { platforms: ['claude', 'codex'] },
    createdAt: new Date(),
    updatedAt: new Date(),
    indexedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock category for testing
 */
export function createMockCategory(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  skillCount: number;
  sortOrder: number;
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
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock rating for testing
 */
export function createMockRating(overrides: Partial<{
  id: string;
  skillId: string;
  userId: string;
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

/**
 * Parse JSON response from NextResponse
 */
export async function parseResponse<T>(response: Response): Promise<{
  status: number;
  data: T;
}> {
  const data = await response.json();
  return {
    status: response.status,
    data,
  };
}
