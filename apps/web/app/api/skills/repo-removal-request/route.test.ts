import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock sanitize
vi.mock('@/lib/sanitize', () => ({
  sanitizeReason: (r: string) => r,
}));

// Mock db
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  userQueries: {
    getByGithubId: vi.fn(),
    upsertFromGithub: vi.fn(),
  },
  skillQueries: {
    countByRepo: vi.fn(),
    blockByRepo: vi.fn(),
  },
  discoveredRepoQueries: {
    blockRepo: vi.fn(),
  },
}));

import { POST } from './route';
import { userQueries, skillQueries, discoveredRepoQueries } from '@skillhub/db';

function createMockUser(overrides: Partial<{ id: string; githubId: string }> = {}) {
  return {
    id: 'user-123',
    githubId: 'gh-12345',
    username: 'rawveg',
    ...overrides,
  };
}

function createRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/skills/repo-removal-request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/skills/repo-removal-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('POST', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await POST(createRequest({ repoUrl: 'rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('should return 400 for missing repoUrl', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });

      const response = await POST(createRequest({}));

      expect(response.status).toBe(400);
    });

    it('should return 400 PARSE_ERROR for invalid repo format', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);

      const response = await POST(createRequest({ repoUrl: 'not-a-valid-format' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('PARSE_ERROR');
    });

    it('should return 404 INVALID_REPO when repo not found on GitHub', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any));

      const response = await POST(createRequest({ repoUrl: 'rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe('INVALID_REPO');
    });

    it('should return 403 NOT_OWNER when requester is not repo owner', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'other-user' } });
      const mockUser = createMockUser({ githubId: 'gh-12345' });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ owner: { login: 'rawveg' } }),
      } as any));

      const response = await POST(createRequest({ repoUrl: 'rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('NOT_OWNER');
    });

    it('should block all skills and return success when owner removes repo', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.countByRepo).mockResolvedValue(16 as any);
      vi.mocked(skillQueries.blockByRepo).mockResolvedValue(undefined);
      vi.mocked(discoveredRepoQueries.blockRepo).mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ owner: { login: 'rawveg' } }),
      } as any));

      const response = await POST(createRequest({ repoUrl: 'rawveg/skillsforge-marketplace', reason: 'I want my skills removed' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.blockedCount).toBe(16);
      expect(data.repo).toBe('rawveg/skillsforge-marketplace');
      expect(skillQueries.blockByRepo).toHaveBeenCalledWith(expect.anything(), 'rawveg', 'skillsforge-marketplace');
      expect(discoveredRepoQueries.blockRepo).toHaveBeenCalledWith(expect.anything(), 'rawveg/skillsforge-marketplace');
    });

    it('should accept full GitHub URL format', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(skillQueries.countByRepo).mockResolvedValue(0 as any);
      vi.mocked(skillQueries.blockByRepo).mockResolvedValue(undefined);
      vi.mocked(discoveredRepoQueries.blockRepo).mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ owner: { login: 'rawveg' } }),
      } as any));

      const response = await POST(createRequest({ repoUrl: 'https://github.com/rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.repo).toBe('rawveg/skillsforge-marketplace');
    });
  });
});
