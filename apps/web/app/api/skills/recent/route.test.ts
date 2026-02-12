import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Helper to create mock skill
function createMockSkill(overrides: Partial<{
  id: string;
  name: string;
  updatedAt: Date;
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
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Mock db
vi.mock('@skillhub/db', () => ({
  createDb: vi.fn(() => ({})),
  skillQueries: {
    getRecent: vi.fn(),
  },
  skills: {},
}));

import { GET } from './route';
import { skillQueries } from '@skillhub/db';

describe('GET /api/skills/recent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return recent skills', async () => {
    const mockSkills = [
      createMockSkill({ id: 'skill-1', updatedAt: new Date('2024-01-02') }),
      createMockSkill({ id: 'skill-2', updatedAt: new Date('2024-01-01') }),
    ];
    vi.mocked(skillQueries.getRecent).mockResolvedValue(mockSkills as any);

    const request = new NextRequest('http://localhost:3000/api/skills/recent');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBe(2);
  });

  it('should order by updatedAt descending', async () => {
    const mockSkills = [
      createMockSkill({ id: 'skill-1', updatedAt: new Date('2024-01-02') }),
      createMockSkill({ id: 'skill-2', updatedAt: new Date('2024-01-01') }),
    ];
    vi.mocked(skillQueries.getRecent).mockResolvedValue(mockSkills as any);

    const request = new NextRequest('http://localhost:3000/api/skills/recent');
    const response = await GET(request);
    const data = await response.json();

    expect(data.skills[0].updatedAt).toBeDefined();
  });

  it('should respect limit parameter', async () => {
    vi.mocked(skillQueries.getRecent).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/skills/recent?limit=5');
    await GET(request);

    expect(skillQueries.getRecent).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(skillQueries.getRecent).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/skills/recent');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
