import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs-extra before importing paths
vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
    readJson: vi.fn(),
    writeJson: vi.fn(),
  },
}));

import fs from 'fs-extra';
import {
  getSkillsPath,
  getSkillPath,
  ensureSkillsDir,
  isSkillInstalled,
  getConfigPath,
  loadConfig,
  saveConfig,
  isFlatFilePlatform,
  getPlatformFilePath,
} from './paths.js';

describe('Path Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSkillsPath', () => {
    it('should return path ending with .claude/skills for claude', () => {
      const result = getSkillsPath('claude');
      expect(result).toContain('.claude');
      expect(result).toContain('skills');
    });

    it('should return path ending with .codex/skills for codex', () => {
      const result = getSkillsPath('codex');
      expect(result).toContain('.codex');
      expect(result).toContain('skills');
    });

    it('should return path ending with .github/instructions for copilot', () => {
      const result = getSkillsPath('copilot');
      expect(result).toContain('.github');
      expect(result).toContain('instructions');
    });

    it('should return path ending with .cursor/rules for cursor', () => {
      const result = getSkillsPath('cursor');
      expect(result).toContain('.cursor');
      expect(result).toContain('rules');
    });

    it('should return path ending with .windsurf/rules for windsurf', () => {
      const result = getSkillsPath('windsurf');
      expect(result).toContain('.windsurf');
      expect(result).toContain('rules');
    });

    it('should return different path for user vs project', () => {
      const userPath = getSkillsPath('claude', false);
      const projectPath = getSkillsPath('claude', true);
      expect(userPath).not.toBe(projectPath);
    });
  });

  describe('getSkillPath', () => {
    it('should append skill name to base path', () => {
      const result = getSkillPath('claude', 'my-skill');
      expect(result).toContain('my-skill');
      expect(result).toContain('.claude');
    });

    it('should handle project path', () => {
      const result = getSkillPath('codex', 'my-skill', true);
      expect(result).toContain('my-skill');
      expect(result).toContain('.codex');
    });
  });

  describe('ensureSkillsDir', () => {
    it('should call fs.ensureDir', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);

      const result = await ensureSkillsDir('claude');

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(result).toContain('.claude');
    });
  });

  describe('isSkillInstalled', () => {
    it('should return true when skill exists', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);

      const result = await isSkillInstalled('claude', 'my-skill');

      expect(result).toBe(true);
      expect(fs.pathExists).toHaveBeenCalled();
    });

    it('should return false when skill does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as never);

      const result = await isSkillInstalled('claude', 'my-skill');

      expect(result).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    it('should return path ending with .skillhub/config.json', () => {
      const result = getConfigPath();
      expect(result).toContain('.skillhub');
      expect(result).toContain('config.json');
    });
  });

  describe('loadConfig', () => {
    it('should load config from file when exists', async () => {
      const mockConfig = { defaultPlatform: 'claude' };
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.readJson).mockResolvedValue(mockConfig as never);

      const result = await loadConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.readJson).toHaveBeenCalled();
    });

    it('should return empty object when config does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as never);

      const result = await loadConfig();

      expect(result).toEqual({});
      expect(fs.readJson).not.toHaveBeenCalled();
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeJson).mockResolvedValue(undefined);

      await saveConfig({ defaultPlatform: 'claude' });

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        { defaultPlatform: 'claude' },
        { spaces: 2 }
      );
    });
  });

  describe('isFlatFilePlatform', () => {
    it('returns false for claude', () => {
      expect(isFlatFilePlatform('claude')).toBe(false);
    });

    it('returns false for codex', () => {
      expect(isFlatFilePlatform('codex')).toBe(false);
    });

    it('returns true for cursor', () => {
      expect(isFlatFilePlatform('cursor')).toBe(true);
    });

    it('returns true for windsurf', () => {
      expect(isFlatFilePlatform('windsurf')).toBe(true);
    });

    it('returns true for copilot', () => {
      expect(isFlatFilePlatform('copilot')).toBe(true);
    });
  });

  describe('getPlatformFilePath', () => {
    it('returns file inside skill subdirectory for claude', () => {
      const result = getPlatformFilePath('claude', 'my-skill', 'SKILL.md');
      expect(result).toContain('my-skill');
      expect(result).toContain('SKILL.md');
    });

    it('returns file in flat directory for cursor', () => {
      const result = getPlatformFilePath('cursor', 'my-skill', 'my-skill.mdc');
      expect(result).toContain('rules');
      expect(result).toContain('my-skill.mdc');
      // Should not have skill name as a directory segment
      expect(result).not.toMatch(/rules[/\\]my-skill[/\\]my-skill\.mdc/);
    });

    it('returns file in flat directory for windsurf', () => {
      const result = getPlatformFilePath('windsurf', 'my-skill', 'my-skill.md');
      expect(result).toContain('rules');
      expect(result).toContain('my-skill.md');
    });

    it('returns file in flat directory for copilot', () => {
      const result = getPlatformFilePath('copilot', 'my-skill', 'my-skill.instructions.md');
      expect(result).toContain('instructions');
      expect(result).toContain('my-skill.instructions.md');
    });
  });
});
