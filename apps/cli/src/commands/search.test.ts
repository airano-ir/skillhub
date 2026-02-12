import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// Mock dependencies
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((s) => s),
    dim: vi.fn((s) => s),
    cyan: vi.fn((s) => s),
    yellow: vi.fn((s) => s),
    red: vi.fn((s) => s),
    green: vi.fn((s) => s),
    white: vi.fn((s) => s),
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock('../utils/api.js', () => ({
  searchSkills: vi.fn(),
}));

import { search } from './search.js';
import { searchSkills } from '../utils/api.js';

describe('search command', () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should search skills via API', async () => {
    vi.mocked(searchSkills).mockResolvedValue({
      skills: [
        {
          id: 'test/skill',
          name: 'test-skill',
          description: 'A test skill',
          githubOwner: 'test',
          githubRepo: 'skill',
          skillPath: 'skills/test',
          branch: 'main',
          githubStars: 100,
          downloadCount: 50,
          securityScore: 85,
          isVerified: true,
          compatibility: { platforms: ['claude', 'codex'] },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await search('test', {});

    expect(searchSkills).toHaveBeenCalledWith('test', { platform: undefined, limit: 10, page: 1, sort: 'downloads' });
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should show "no skills found" message', async () => {
    vi.mocked(searchSkills).mockResolvedValue({
      skills: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    await search('nonexistent', {});

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
  });

  it('should filter by platform', async () => {
    vi.mocked(searchSkills).mockResolvedValue({
      skills: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    await search('test', { platform: 'claude' });

    expect(searchSkills).toHaveBeenCalledWith('test', expect.objectContaining({ platform: 'claude' }));
  });

  it('should respect limit option', async () => {
    vi.mocked(searchSkills).mockResolvedValue({
      skills: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await search('test', { limit: '20' });

    expect(searchSkills).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 20 }));
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(searchSkills).mockRejectedValue(new Error('API error'));

    await search('test', {});

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('API error'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should display pagination info when more results available', async () => {
    vi.mocked(searchSkills).mockResolvedValue({
      skills: [
        {
          id: 'test/skill',
          name: 'test-skill',
          description: 'A test skill',
          githubOwner: 'test',
          githubRepo: 'skill',
          skillPath: 'skills/test',
          branch: 'main',
          githubStars: 100,
          downloadCount: 50,
          securityScore: 85,
          isVerified: false,
          compatibility: { platforms: ['claude'] },
        },
      ],
      pagination: { page: 1, limit: 10, total: 50, totalPages: 5 },
    });

    await search('test', {});

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Page 1 of 5'));
  });
});
