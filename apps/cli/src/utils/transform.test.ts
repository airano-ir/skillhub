import { describe, it, expect } from 'vitest';
import { getPlatformFileName, transformForPlatform, shouldKeepOriginal } from './transform.js';
import type { ParsedSkill } from 'skillhub-core';

function makeParsed(overrides: Partial<ParsedSkill['metadata']> = {}, body = '# Test Skill\n\nThis is a test skill.\n\n## Usage\n\nUse this skill for testing.'): ParsedSkill {
  return {
    metadata: {
      name: 'test-skill',
      description: 'A comprehensive test skill',
      version: '1.0.0',
      ...overrides,
    },
    content: body,
    resources: { scripts: [], references: [], assets: [] },
    validation: { isValid: true, errors: [], warnings: [] },
    rawFrontmatter: { name: 'test-skill', description: 'A comprehensive test skill', version: '1.0.0', ...overrides },
  } as ParsedSkill;
}

const RAW_SKILL_MD = `---
name: test-skill
description: A comprehensive test skill
version: 1.0.0
---

# Test Skill

This is a test skill.

## Usage

Use this skill for testing.
`;

describe('getPlatformFileName', () => {
  it('returns SKILL.md for claude', () => {
    expect(getPlatformFileName('claude', 'my-skill')).toBe('SKILL.md');
  });

  it('returns SKILL.md for codex', () => {
    expect(getPlatformFileName('codex', 'my-skill')).toBe('SKILL.md');
  });

  it('returns .mdc for cursor', () => {
    expect(getPlatformFileName('cursor', 'my-skill')).toBe('my-skill.mdc');
  });

  it('returns .md for windsurf', () => {
    expect(getPlatformFileName('windsurf', 'my-skill')).toBe('my-skill.md');
  });

  it('returns .instructions.md for copilot', () => {
    expect(getPlatformFileName('copilot', 'my-skill')).toBe('my-skill.instructions.md');
  });
});

describe('shouldKeepOriginal', () => {
  it('returns false for claude', () => {
    expect(shouldKeepOriginal('claude')).toBe(false);
  });

  it('returns false for codex', () => {
    expect(shouldKeepOriginal('codex')).toBe(false);
  });

  it('returns true for cursor', () => {
    expect(shouldKeepOriginal('cursor')).toBe(true);
  });

  it('returns true for windsurf', () => {
    expect(shouldKeepOriginal('windsurf')).toBe(true);
  });

  it('returns true for copilot', () => {
    expect(shouldKeepOriginal('copilot')).toBe(true);
  });
});

describe('transformForPlatform', () => {
  describe('claude', () => {
    it('returns content unchanged', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('claude', RAW_SKILL_MD, parsed);
      expect(result.content).toBe(RAW_SKILL_MD);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('codex', () => {
    it('returns content unchanged', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('codex', RAW_SKILL_MD, parsed);
      expect(result.content).toBe(RAW_SKILL_MD);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('cursor (MDC format)', () => {
    it('produces MDC with description and alwaysApply', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('cursor', RAW_SKILL_MD, parsed);
      expect(result.content).toContain('---');
      expect(result.content).toContain('description: A comprehensive test skill');
      expect(result.content).toContain('alwaysApply: true');
      expect(result.warnings).toHaveLength(0);
    });

    it('maps triggers.filePatterns to globs', () => {
      const parsed = makeParsed({
        triggers: { filePatterns: ['*.tsx', '*.jsx'] },
      });
      const result = transformForPlatform('cursor', RAW_SKILL_MD, parsed);
      expect(result.content).toContain('globs: *.tsx, *.jsx');
      expect(result.content).toContain('alwaysApply: false');
    });

    it('sets alwaysApply true when no triggers', () => {
      const parsed = makeParsed({ triggers: undefined });
      const result = transformForPlatform('cursor', RAW_SKILL_MD, parsed);
      expect(result.content).toContain('alwaysApply: true');
      expect(result.content).not.toContain('globs:');
    });

    it('strips original YAML frontmatter fields', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('cursor', RAW_SKILL_MD, parsed);
      expect(result.content).not.toContain('version: 1.0.0');
      expect(result.content).not.toContain('name: test-skill');
    });

    it('preserves markdown body', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('cursor', RAW_SKILL_MD, parsed);
      expect(result.content).toContain('# Test Skill');
      expect(result.content).toContain('## Usage');
    });
  });

  describe('windsurf', () => {
    it('strips YAML frontmatter', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('windsurf', RAW_SKILL_MD, parsed);
      expect(result.content).not.toContain('---');
      expect(result.content).not.toContain('version:');
      expect(result.content).toContain('# Test Skill');
    });

    it('adds heading when body does not start with one', () => {
      const parsed = makeParsed({}, 'Some content without heading.');
      const result = transformForPlatform('windsurf', RAW_SKILL_MD, parsed);
      expect(result.content).toMatch(/^# test-skill\n/);
    });

    it('does not add heading when body starts with one', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('windsurf', RAW_SKILL_MD, parsed);
      expect(result.content).not.toMatch(/^# test-skill\n/);
      expect(result.content).toMatch(/^# Test Skill\n/);
    });

    it('truncates and warns when content exceeds 6K limit', () => {
      const longBody = '# Long Skill\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(300);
      const parsed = makeParsed({}, longBody);
      const result = transformForPlatform('windsurf', RAW_SKILL_MD, parsed);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('6000');
      expect(result.content.length).toBeLessThanOrEqual(6000);
    });

    it('no warning when content is under limit', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('windsurf', RAW_SKILL_MD, parsed);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('copilot', () => {
    it('strips YAML frontmatter', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('copilot', RAW_SKILL_MD, parsed);
      expect(result.content).not.toContain('---');
      expect(result.content).toContain('# Test Skill');
    });

    it('adds heading when body does not start with one', () => {
      const parsed = makeParsed({}, 'Some content without heading.');
      const result = transformForPlatform('copilot', RAW_SKILL_MD, parsed);
      expect(result.content).toMatch(/^# test-skill\n/);
    });

    it('returns no warnings', () => {
      const parsed = makeParsed();
      const result = transformForPlatform('copilot', RAW_SKILL_MD, parsed);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
