import { describe, it, expect } from 'vitest';
import { filterAndSortBranches } from './deep-scan.js';

describe('filterAndSortBranches', () => {
  it('returns only defaultBranch when no matching branches exist', () => {
    const result = filterAndSortBranches(
      ['main', 'feature/foo', 'bugfix/bar', 'experiment'],
      'main'
    );
    expect(result).toEqual(['main']);
  });

  it('includes well-known branch names (up to 5 non-default cap)', () => {
    const result = filterAndSortBranches(
      ['main', 'stable', 'next', 'latest', 'canary', 'dev', 'develop', 'feature/x'],
      'main'
    );
    expect(result[0]).toBe('main');
    expect(result).toContain('stable');
    expect(result).toContain('next');
    expect(result).toContain('dev');
    // 6 well-known names but only 5 non-default slots, so some get dropped
    expect(result.length).toBe(6); // main + 5
    expect(result).not.toContain('feature/x');
  });

  it('includes version branches matching /^[vV]\\d/', () => {
    const result = filterAndSortBranches(
      ['main', 'v4', 'v3', 'v2', 'v1'],
      'main'
    );
    expect(result[0]).toBe('main');
    expect(result).toContain('v4');
    expect(result).toContain('v3');
    expect(result).toContain('v2');
    expect(result).toContain('v1');
  });

  it('sorts version branches by semver descending', () => {
    const result = filterAndSortBranches(
      ['main', 'v1', 'v3', 'v2', 'v10', 'v4'],
      'main'
    );
    const versions = result.filter(b => b.startsWith('v'));
    expect(versions[0]).toBe('v10');
    expect(versions[1]).toBe('v4');
    expect(versions[2]).toBe('v3');
    expect(versions[3]).toBe('v2');
  });

  it('handles complex version numbers (v2.1, v3.0.1)', () => {
    const result = filterAndSortBranches(
      ['main', 'v2.1', 'v2.0', 'v3.0.1', 'v1.5'],
      'main'
    );
    const versions = result.filter(b => b.startsWith('v'));
    expect(versions[0]).toBe('v3.0.1');
    expect(versions[1]).toBe('v2.1');
    expect(versions[2]).toBe('v2.0');
    expect(versions[3]).toBe('v1.5');
  });

  it('takes only top 5 version branches', () => {
    const result = filterAndSortBranches(
      ['main', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
      'main'
    );
    // defaultBranch + 5 non-default max
    expect(result.length).toBeLessThanOrEqual(6);
    // Should have the top 5 versions (v8, v7, v6, v5, v4)
    expect(result).toContain('v8');
    expect(result).toContain('v7');
    expect(result).toContain('v6');
    expect(result).toContain('v5');
    expect(result).toContain('v4');
    expect(result).not.toContain('v1');
  });

  it('caps total non-default at 5 when mixing well-known + versions', () => {
    const result = filterAndSortBranches(
      ['main', 'stable', 'next', 'dev', 'v4', 'v3', 'v2', 'v1'],
      'main'
    );
    // 1 default + max 5 non-default
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result[0]).toBe('main');
  });

  it('includes release/ and releases/ prefixed branches', () => {
    const result = filterAndSortBranches(
      ['main', 'release/3.0', 'releases/v2', 'feature/x'],
      'main'
    );
    expect(result).toContain('release/3.0');
    expect(result).toContain('releases/v2');
    expect(result).not.toContain('feature/x');
  });

  it('applies extra patterns from CLI (exact and prefix match)', () => {
    const result = filterAndSortBranches(
      ['main', 'alpha', 'beta', 'alpha/test', 'feature/x'],
      'main',
      ['alpha', 'beta']
    );
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
    expect(result).not.toContain('feature/x');
  });

  it('excludes defaultBranch from filtered list even if it matches a pattern', () => {
    const result = filterAndSortBranches(
      ['dev', 'v4', 'stable'],
      'dev'
    );
    expect(result[0]).toBe('dev');
    // dev should appear only once
    const devCount = result.filter(b => b === 'dev').length;
    expect(devCount).toBe(1);
  });

  it('puts defaultBranch first always', () => {
    const result = filterAndSortBranches(
      ['v10', 'master', 'v5', 'stable'],
      'master'
    );
    expect(result[0]).toBe('master');
  });

  it('handles V (uppercase) version branches', () => {
    const result = filterAndSortBranches(
      ['main', 'V4', 'V3'],
      'main'
    );
    expect(result).toContain('V4');
    expect(result).toContain('V3');
  });

  it('returns [defaultBranch] for empty branch list', () => {
    const result = filterAndSortBranches([], 'main');
    expect(result).toEqual(['main']);
  });

  it('returns [defaultBranch] when only default is in the list', () => {
    const result = filterAndSortBranches(['main'], 'main');
    expect(result).toEqual(['main']);
  });
});
