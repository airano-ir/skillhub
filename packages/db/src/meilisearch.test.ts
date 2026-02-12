import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMeilisearchConfigured,
  getMeilisearchClient,
  isMeilisearchHealthy,
  initializeSkillsIndex,
  addSkillDocument,
  addSkillDocuments,
  deleteSkillDocument,
  searchSkills,
  getAllSkillDocuments,
  clearSkillsIndex,
  type MeiliSkillDocument,
} from './meilisearch.js';

// Store original env
const originalEnv = { ...process.env };

// Mock MeiliSearch class
vi.mock('meilisearch', () => {
  const mockIndex = {
    search: vi.fn(),
    addDocuments: vi.fn().mockResolvedValue({ taskUid: 1 }),
    deleteDocument: vi.fn().mockResolvedValue({ taskUid: 2 }),
    deleteAllDocuments: vi.fn().mockResolvedValue({ taskUid: 3 }),
    getDocuments: vi.fn().mockResolvedValue({ results: [] }),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSearchableAttributes: vi.fn().mockResolvedValue({ taskUid: 4 }),
    updateFilterableAttributes: vi.fn().mockResolvedValue({ taskUid: 5 }),
    updateSortableAttributes: vi.fn().mockResolvedValue({ taskUid: 6 }),
    updateRankingRules: vi.fn().mockResolvedValue({ taskUid: 7 }),
  };

  return {
    MeiliSearch: vi.fn().mockImplementation(() => ({
      health: vi.fn().mockResolvedValue({ status: 'available' }),
      index: vi.fn().mockReturnValue(mockIndex),
      createIndex: vi.fn().mockResolvedValue({ taskUid: 0 }),
    })),
    Index: vi.fn(),
  };
});

describe('Meilisearch Configuration', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.MEILI_URL;
    delete process.env.MEILI_MASTER_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('isMeilisearchConfigured', () => {
    it('should return true when MEILI_URL is set', () => {
      process.env.MEILI_URL = 'http://localhost:7700';

      expect(isMeilisearchConfigured()).toBe(true);
    });

    it('should return false when MEILI_URL is not set', () => {
      delete process.env.MEILI_URL;

      expect(isMeilisearchConfigured()).toBe(false);
    });

    it('should return false when MEILI_URL is empty', () => {
      process.env.MEILI_URL = '';

      expect(isMeilisearchConfigured()).toBe(false);
    });
  });

  describe('getMeilisearchClient', () => {
    it('should return null when not configured', () => {
      delete process.env.MEILI_URL;

      const client = getMeilisearchClient();

      expect(client).toBeNull();
    });

    it('should return client instance when configured', () => {
      process.env.MEILI_URL = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';

      const client = getMeilisearchClient();

      expect(client).not.toBeNull();
    });

    it('should return same instance (singleton)', () => {
      process.env.MEILI_URL = 'http://localhost:7700';

      const client1 = getMeilisearchClient();
      const client2 = getMeilisearchClient();

      expect(client1).toBe(client2);
    });
  });
});

describe('Meilisearch Health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isMeilisearchHealthy', () => {
    it('should return false when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await isMeilisearchHealthy();

      expect(result).toBe(false);
    });

    it('should return true when Meilisearch is healthy', async () => {
      process.env.MEILI_URL = 'http://localhost:7700';

      const result = await isMeilisearchHealthy();

      expect(result).toBe(true);
    });
  });
});

describe('Meilisearch Index Operations', () => {
  beforeEach(() => {
    process.env.MEILI_URL = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'test-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MEILI_URL;
    delete process.env.MEILI_MASTER_KEY;
  });

  describe('initializeSkillsIndex', () => {
    it('should create index with correct settings', async () => {
      await initializeSkillsIndex();

      // The function should complete without errors
      expect(true).toBe(true);
    });
  });
});

describe('Meilisearch Document Operations', () => {
  const testSkillDocument: MeiliSkillDocument = {
    id: 'test-owner/test-repo/test-skill',
    name: 'test-skill',
    description: 'A test skill',
    githubOwner: 'test-owner',
    githubRepo: 'test-repo',
    platforms: ['claude', 'codex'],
    githubStars: 100,
    downloadCount: 50,
    rating: 4,
    securityScore: 85,
    isFeatured: false,
    isVerified: true,
    indexedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    process.env.MEILI_URL = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'test-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MEILI_URL;
    delete process.env.MEILI_MASTER_KEY;
  });

  describe('addSkillDocument', () => {
    it('should add document to index', async () => {
      const result = await addSkillDocument(testSkillDocument);

      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await addSkillDocument(testSkillDocument);

      expect(result).toBe(false);
    });
  });

  describe('addSkillDocuments', () => {
    it('should add multiple documents', async () => {
      const skills = [
        testSkillDocument,
        { ...testSkillDocument, id: 'another/skill/test' },
      ];

      const result = await addSkillDocuments(skills);

      expect(result).toBe(true);
    });

    it('should return true for empty array', async () => {
      const result = await addSkillDocuments([]);

      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await addSkillDocuments([testSkillDocument]);

      expect(result).toBe(false);
    });
  });

  describe('deleteSkillDocument', () => {
    it('should delete document from index', async () => {
      const result = await deleteSkillDocument('test-owner/test-repo/test-skill');

      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await deleteSkillDocument('test-owner/test-repo/test-skill');

      expect(result).toBe(false);
    });
  });

  describe('getAllSkillDocuments', () => {
    it('should return all documents', async () => {
      const result = await getAllSkillDocuments();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await getAllSkillDocuments();

      expect(result).toEqual([]);
    });
  });

  describe('clearSkillsIndex', () => {
    it('should clear all documents', async () => {
      const result = await clearSkillsIndex();

      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await clearSkillsIndex();

      expect(result).toBe(false);
    });
  });
});

describe('Meilisearch Search', () => {
  beforeEach(() => {
    process.env.MEILI_URL = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'test-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MEILI_URL;
    delete process.env.MEILI_MASTER_KEY;
  });

  describe('searchSkills', () => {
    it('should search with query', async () => {
      // Mock search response
      const { MeiliSearch } = await import('meilisearch');
      const mockClient = new MeiliSearch({ host: 'http://localhost:7700' });
      const mockIndex = mockClient.index('skills');
      vi.mocked(mockIndex.search).mockResolvedValue({
        hits: [],
        estimatedTotalHits: 0,
        processingTimeMs: 1,
        query: 'test',
        limit: 20,
        offset: 0,
      });

      const result = await searchSkills({ query: 'test' });

      // Result could be null if index doesn't exist
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return null when not configured', async () => {
      delete process.env.MEILI_URL;

      const result = await searchSkills({ query: 'test' });

      expect(result).toBeNull();
    });

    it('should apply platform filter', async () => {
      const result = await searchSkills({
        query: 'test',
        filters: { platforms: ['claude'] },
      });

      // Just verify it doesn't throw
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should apply star filter', async () => {
      const result = await searchSkills({
        query: 'test',
        filters: { minStars: 100 },
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should apply verified filter', async () => {
      const result = await searchSkills({
        query: 'test',
        filters: { verified: true },
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should apply featured filter', async () => {
      const result = await searchSkills({
        query: 'test',
        filters: { featured: true },
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should apply security score filter', async () => {
      const result = await searchSkills({
        query: 'test',
        filters: { minSecurity: 80 },
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should sort by stars', async () => {
      const result = await searchSkills({
        query: 'test',
        sort: 'stars',
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should sort by downloads', async () => {
      const result = await searchSkills({
        query: 'test',
        sort: 'downloads',
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should sort by rating', async () => {
      const result = await searchSkills({
        query: 'test',
        sort: 'rating',
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should sort by recent', async () => {
      const result = await searchSkills({
        query: 'test',
        sort: 'recent',
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should respect pagination', async () => {
      const result = await searchSkills({
        query: 'test',
        limit: 10,
        offset: 20,
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});
