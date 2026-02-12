import { describe, it, expect, vi } from 'vitest';

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
    readJson: vi.fn(),
    writeJson: vi.fn(),
  },
}));

import { getSkillsPath, type Platform } from './paths.js';

const ALL_PLATFORMS: Platform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];

describe('Platform Configuration Completeness', () => {
  describe('All platforms have path configuration', () => {
    ALL_PLATFORMS.forEach((platform) => {
      it(`should have user path for ${platform}`, () => {
        const userPath = getSkillsPath(platform, false);
        expect(userPath).toBeTruthy();
      });

      it(`should have project path for ${platform}`, () => {
        const projectPath = getSkillsPath(platform, true);
        expect(projectPath).toBeTruthy();
      });
    });
  });

  describe('Platform paths are unique', () => {
    it('should have different user paths for each platform', () => {
      const paths = ALL_PLATFORMS.map((p) => getSkillsPath(p, false));
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(ALL_PLATFORMS.length);
    });

    it('should have different project paths for each platform', () => {
      const paths = ALL_PLATFORMS.map((p) => getSkillsPath(p, true));
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(ALL_PLATFORMS.length);
    });
  });

  describe('Platform paths match expected patterns', () => {
    it('claude should use .claude/skills', () => {
      expect(getSkillsPath('claude', false)).toContain('.claude');
    });

    it('codex should use .codex/skills', () => {
      expect(getSkillsPath('codex', false)).toContain('.codex');
    });

    it('copilot should use .github/instructions', () => {
      const p = getSkillsPath('copilot', false);
      expect(p).toContain('.github');
      expect(p).toContain('instructions');
    });

    it('cursor should use .cursor/rules', () => {
      const p = getSkillsPath('cursor', false);
      expect(p).toContain('.cursor');
      expect(p).toContain('rules');
    });

    it('windsurf should use .windsurf/rules', () => {
      const p = getSkillsPath('windsurf', false);
      expect(p).toContain('.windsurf');
      expect(p).toContain('rules');
    });
  });
});
