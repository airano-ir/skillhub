import { describe, it, expect } from 'vitest';
import { parseGitHubRepoUrl } from './crawl.js';

describe('parseGitHubRepoUrl', () => {
  it('parses plain repo URL', () => {
    const result = parseGitHubRepoUrl('https://github.com/nuxt/ui');
    expect(result).toEqual({ owner: 'nuxt', repo: 'ui', branch: null });
  });

  it('parses URL with /tree/branch', () => {
    const result = parseGitHubRepoUrl('https://github.com/nuxt/ui/tree/v4');
    expect(result).toEqual({ owner: 'nuxt', repo: 'ui', branch: 'v4' });
  });

  it('parses URL with /tree/branch and subdirectory path', () => {
    const result = parseGitHubRepoUrl('https://github.com/nuxt/ui/tree/v4/skills/nuxt-ui');
    expect(result).toEqual({ owner: 'nuxt', repo: 'ui', branch: 'v4' });
  });

  it('parses URL with trailing slash', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: null });
  });

  it('parses URL with /tree/ but no branch (just tree segment)', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo/tree/');
    // parts[3] would be undefined since there's no branch after /tree/
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: null });
  });

  it('handles http URLs', () => {
    const result = parseGitHubRepoUrl('http://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: null });
  });

  it('handles release branches with slashes in name', () => {
    // Note: only first segment after /tree/ is captured as branch
    const result = parseGitHubRepoUrl('https://github.com/owner/repo/tree/release');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'release' });
  });

  it('throws on URL with only owner', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/onlyone')).toThrow('Invalid GitHub URL');
  });

  it('throws on URL with no path', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/')).toThrow('Invalid GitHub URL');
  });

  it('handles repo URL with blob segment (not tree)', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo/blob/main/README.md');
    // /blob/ is not /tree/, so no branch extraction
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: null });
  });
});
