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

// Mock email
vi.mock('@/lib/email', () => ({
  sendClaimSubmittedEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock db
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  userQueries: {
    getByGithubId: vi.fn(),
    upsertFromGithub: vi.fn(),
  },
  skillQueries: {
    unblockByRepo: vi.fn(),
  },
  addRequestQueries: {
    hasPendingRequest: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
  },
  discoveredRepoQueries: {
    getById: vi.fn(),
    upsert: vi.fn(),
    unblockRepo: vi.fn(),
  },
}));

import { POST, GET } from './route';
import { userQueries, skillQueries, addRequestQueries, discoveredRepoQueries } from '@skillhub/db';

function createMockUser(overrides: Partial<{ id: string; githubId: string; email: string }> = {}) {
  return {
    id: 'user-123',
    githubId: 'gh-12345',
    username: 'testuser',
    email: 'test@example.com',
    preferredLocale: 'en',
    ...overrides,
  };
}

function createRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/skills/add-request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/skills/add-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Disable real fetch by default
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('GET', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('should return empty requests for unknown user', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345' } });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(null as any);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.requests).toEqual([]);
    });
  });

  describe('POST', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await POST(createRequest({ repositoryUrl: 'https://github.com/owner/repo' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('should return 400 for missing repositoryUrl', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'testuser' } });

      const response = await POST(createRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for invalid GitHub URL', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'testuser' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);

      // gitlab.com does not contain the substring 'github.com'
      const response = await POST(createRequest({ repositoryUrl: 'https://gitlab.com/owner/repo' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_URL');
    });

    it('should return 403 REPO_BLOCKED_BY_OWNER when non-owner tries to add blocked repo', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'non-owner' } });
      const mockUser = createMockUser({ githubId: 'gh-12345' });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(discoveredRepoQueries.getById).mockResolvedValue({
        id: 'rawveg/skillsforge-marketplace',
        isBlocked: true,
      } as any);
      // GitHub API says the owner is 'rawveg', not 'non-owner'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ owner: { login: 'rawveg' }, default_branch: 'main', private: false }),
      } as any));

      const response = await POST(createRequest({ repositoryUrl: 'https://github.com/rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('REPO_BLOCKED_BY_OWNER');
    });

    it('should re-enable repo when owner re-adds their blocked repo', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'rawveg' } });
      const mockUser = createMockUser({ githubId: 'gh-12345' });
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(discoveredRepoQueries.getById).mockResolvedValue({
        id: 'rawveg/skillsforge-marketplace',
        isBlocked: true,
      } as any);
      vi.mocked(skillQueries.unblockByRepo).mockResolvedValue(undefined);
      vi.mocked(discoveredRepoQueries.unblockRepo).mockResolvedValue(undefined);
      vi.mocked(addRequestQueries.hasPendingRequest).mockResolvedValue(false as any);
      vi.mocked(addRequestQueries.create).mockResolvedValue('req-123' as any);
      vi.mocked(addRequestQueries.updateStatus).mockResolvedValue(undefined);
      vi.mocked(discoveredRepoQueries.upsert).mockResolvedValue(undefined as any);

      // First fetch: ownership check (inside blocked-repo logic)
      // Second fetch: repo validation (validateGitHubRepo → repoResponse)
      // Third fetch: tree scan (findSkillMdFiles)
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ owner: { login: 'rawveg' }, default_branch: 'main', private: false }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ owner: { login: 'rawveg' }, default_branch: 'main', private: false }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tree: [
              { path: 'SKILL.md', type: 'blob' },
            ],
            truncated: false,
          }),
        } as any)
      );

      const response = await POST(createRequest({ repositoryUrl: 'https://github.com/rawveg/skillsforge-marketplace' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.reEnabled).toBe(true);
      expect(skillQueries.unblockByRepo).toHaveBeenCalledWith(expect.anything(), 'rawveg', 'skillsforge-marketplace');
      expect(discoveredRepoQueries.unblockRepo).toHaveBeenCalledWith(expect.anything(), 'rawveg/skillsforge-marketplace');
    });

    it('should proceed normally when repo is not blocked (Case C)', async () => {
      mockAuth.mockResolvedValue({ user: { githubId: 'gh-12345', username: 'newuser' } });
      const mockUser = createMockUser();
      vi.mocked(userQueries.getByGithubId).mockResolvedValue(mockUser as any);
      vi.mocked(discoveredRepoQueries.getById).mockResolvedValue(null as any);
      vi.mocked(addRequestQueries.hasPendingRequest).mockResolvedValue(false as any);
      vi.mocked(addRequestQueries.create).mockResolvedValue('req-456' as any);
      vi.mocked(addRequestQueries.updateStatus).mockResolvedValue(undefined);
      vi.mocked(discoveredRepoQueries.upsert).mockResolvedValue(undefined as any);

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ owner: { login: 'someowner' }, default_branch: 'main', private: false }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tree: [{ path: 'SKILL.md', type: 'blob' }],
            truncated: false,
          }),
        } as any)
      );

      const response = await POST(createRequest({ repositoryUrl: 'https://github.com/someowner/newrepo' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.reEnabled).toBeUndefined();
    });
  });
});
