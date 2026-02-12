import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';

// Use vi.hoisted to make mock state available to hoisted vi.mock calls
const mockState = vi.hoisted(() => ({
  responseData: {
    skills: [{ id: 'test-skill', name: 'Test Skill' }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  } as unknown,
  statusCode: 200,
  shouldError: false,
}));

// Mock https module
vi.mock('https', () => {
  return {
    default: {
      request: vi.fn().mockImplementation((_options: unknown, callback: (res: unknown) => void) => {
        const req = new PassThrough();

        if (mockState.shouldError) {
          Object.assign(req, {
            on: vi.fn().mockImplementation((event: string, handler: (err?: Error) => void) => {
              if (event === 'error') {
                setImmediate(() => handler(new Error('Network error')));
              }
              return req;
            }),
            write: vi.fn(),
            end: vi.fn(),
            destroy: vi.fn(),
          });
          return req;
        }

        const res = new PassThrough();
        Object.assign(res, {
          statusCode: mockState.statusCode,
          setTimeout: vi.fn(),
        });

        setImmediate(() => {
          callback(res);
          res.push(JSON.stringify(mockState.responseData));
          res.push(null);
        });

        Object.assign(req, {
          on: vi.fn().mockReturnThis(),
          write: vi.fn(),
          end: vi.fn(),
          destroy: vi.fn(),
        });
        return req;
      }),
    },
    request: vi.fn().mockImplementation((_options: unknown, callback: (res: unknown) => void) => {
      const req = new PassThrough();

      if (mockState.shouldError) {
        Object.assign(req, {
          on: vi.fn().mockImplementation((event: string, handler: (err?: Error) => void) => {
            if (event === 'error') {
              setImmediate(() => handler(new Error('Network error')));
            }
            return req;
          }),
          write: vi.fn(),
          end: vi.fn(),
          destroy: vi.fn(),
        });
        return req;
      }

      const res = new PassThrough();
      Object.assign(res, {
        statusCode: mockState.statusCode,
        setTimeout: vi.fn(),
      });

      setImmediate(() => {
        callback(res);
        res.push(JSON.stringify(mockState.responseData));
        res.push(null);
      });

      Object.assign(req, {
        on: vi.fn().mockReturnThis(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      });
      return req;
    }),
  };
});

// Mock http module
vi.mock('http', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

// Import after mocking
import { searchSkills, getSkill, trackInstall } from './api.js';

describe('API Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default
    mockState.responseData = {
      skills: [{ id: 'test-skill', name: 'Test Skill' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockState.statusCode = 200;
    mockState.shouldError = false;
  });

  describe('searchSkills', () => {
    it('should search skills with query', async () => {
      const result = await searchSkills('test');

      expect(result.skills).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('should return skills array', async () => {
      const result = await searchSkills('test');

      expect(Array.isArray(result.skills)).toBe(true);
    });

    it('should return pagination info', async () => {
      const result = await searchSkills('test');

      expect(result.pagination.page).toBeDefined();
      expect(result.pagination.limit).toBeDefined();
    });
  });

  describe('getSkill', () => {
    it('should return skill data when found', async () => {
      mockState.responseData = { id: 'test/repo/skill', name: 'Test Skill' };

      const result = await getSkill('test/repo/skill');

      expect(result).toBeDefined();
      expect(result?.id).toBe('test/repo/skill');
    });

    it('should return null for 404', async () => {
      mockState.statusCode = 404;
      mockState.responseData = { error: 'Not found' };

      const result = await getSkill('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('trackInstall', () => {
    it('should not throw on success', async () => {
      mockState.responseData = { success: true };

      // Should not throw
      await expect(trackInstall('test/skill', 'claude', 'cli')).resolves.not.toThrow();
    });

    it('should not throw on failure', async () => {
      mockState.shouldError = true;

      // Should not throw - tracking failures are silently ignored
      await expect(trackInstall('test/skill', 'claude')).resolves.not.toThrow();
    });
  });
});
