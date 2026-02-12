import { describe, it, expect } from 'vitest';
import { parseSkillMd, parseGenericInstructionFile, extractMetadata, isValidSkillId, parseSkillId, INSTRUCTION_FILE_PATTERNS } from './skill-parser.js';

describe('parseSkillMd', () => {
  it('should parse a valid SKILL.md', () => {
    const content = `---
name: test-skill
description: A test skill for unit testing
version: 1.0.0
license: MIT
compatibility:
  platforms:
    - claude
    - codex
---

# Test Skill

This is a test skill that demonstrates the parser.

## Usage

Use this skill to test the parser functionality.
`;

    const result = parseSkillMd(content);

    expect(result.metadata.name).toBe('test-skill');
    expect(result.metadata.description).toBe('A test skill for unit testing');
    expect(result.metadata.version).toBe('1.0.0');
    expect(result.metadata.license).toBe('MIT');
    expect(result.metadata.compatibility?.platforms).toContain('claude');
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
  });

  it('should return errors for missing required fields', () => {
    const content = `---
version: 1.0.0
---

Some content here.
`;

    const result = parseSkillMd(content);

    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toHaveLength(2);
    expect(result.validation.errors[0].code).toBe('MISSING_NAME');
    expect(result.validation.errors[1].code).toBe('MISSING_DESCRIPTION');
  });

  it('should validate name format', () => {
    const content = `---
name: Invalid Name With Spaces
description: Test description here
---

Content.
`;

    const result = parseSkillMd(content);

    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors.some((e) => e.code === 'INVALID_NAME_FORMAT')).toBe(true);
  });

  it('should warn for short descriptions', () => {
    const content = `---
name: test-skill
description: Short
---

Content.
`;

    const result = parseSkillMd(content);

    expect(result.validation.warnings.some((w) => w.code === 'DESCRIPTION_TOO_SHORT')).toBe(true);
  });

  it('should discover script references in content', () => {
    const content = `---
name: test-skill
description: A test skill with scripts
---

This skill uses scripts/build.sh for building.
Also uses scripts/deploy.py for deployment.
`;

    const result = parseSkillMd(content);

    expect(result.resources.scripts).toHaveLength(2);
    expect(result.resources.scripts[0].name).toBe('build.sh');
    expect(result.resources.scripts[1].name).toBe('deploy.py');
  });
});

describe('extractMetadata', () => {
  it('should extract metadata from valid content', () => {
    const content = `---
name: my-skill
description: My awesome skill
version: 2.0.0
---

Content here.
`;

    const metadata = extractMetadata(content);

    expect(metadata).not.toBeNull();
    expect(metadata?.name).toBe('my-skill');
    expect(metadata?.description).toBe('My awesome skill');
    expect(metadata?.version).toBe('2.0.0');
  });

  it('should return null for invalid content', () => {
    const content = `---
version: 1.0.0
---

No name or description.
`;

    const metadata = extractMetadata(content);
    expect(metadata).toBeNull();
  });
});

describe('isValidSkillId', () => {
  it('should validate correct skill IDs', () => {
    expect(isValidSkillId('owner/repo')).toBe(true);
    expect(isValidSkillId('owner/repo/skill-name')).toBe(true);
    expect(isValidSkillId('my-org/my-repo/my-skill')).toBe(true);
  });

  it('should reject invalid skill IDs', () => {
    expect(isValidSkillId('single')).toBe(false);
    expect(isValidSkillId('a/b/c/d')).toBe(false);
    expect(isValidSkillId('/invalid')).toBe(false);
    expect(isValidSkillId('invalid/')).toBe(false);
  });
});

describe('parseSkillId', () => {
  it('should parse two-part skill ID', () => {
    const result = parseSkillId('owner/repo');

    expect(result).not.toBeNull();
    expect(result?.owner).toBe('owner');
    expect(result?.repo).toBe('repo');
    expect(result?.name).toBeUndefined();
  });

  it('should parse three-part skill ID', () => {
    const result = parseSkillId('owner/repo/skill-name');

    expect(result).not.toBeNull();
    expect(result?.owner).toBe('owner');
    expect(result?.repo).toBe('repo');
    expect(result?.name).toBe('skill-name');
  });

  it('should return null for invalid ID', () => {
    expect(parseSkillId('invalid')).toBeNull();
    expect(parseSkillId('a/b/c/d')).toBeNull();
  });
});

describe('parseGenericInstructionFile', () => {
  it('should parse a .cursorrules file with synthetic metadata', () => {
    const content = `You are an expert React developer.

Always use TypeScript.
Prefer functional components.

## Guidelines
- Use hooks
- No class components`;

    const result = parseGenericInstructionFile(content, 'cursorrules', {
      name: 'my-app',
      description: 'A React application with best practices',
      owner: 'testuser',
    });

    expect(result.metadata.name).toBe('my-app');
    expect(result.metadata.description).toBe('A React application with best practices');
    expect(result.metadata.compatibility?.platforms).toContain('cursor');
    expect(result.validation.isValid).toBe(true);
  });

  it('should reject files that are too short', () => {
    const content = 'short';

    const result = parseGenericInstructionFile(content, 'cursorrules', {
      name: 'test',
      description: null,
      owner: 'owner',
    });

    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors[0].code).toBe('CONTENT_TOO_SHORT');
  });

  it('should extract frontmatter from AGENTS.md if present', () => {
    const content = `---
name: my-agent
description: An agent helper for code review
---

# Instructions

Do the thing.
Do it well.
Use TypeScript always.`;

    const result = parseGenericInstructionFile(content, 'agents.md', {
      name: 'repo-name',
      description: null,
      owner: 'owner',
    });

    expect(result.metadata.name).toBe('my-agent');
    expect(result.metadata.description).toBe('An agent helper for code review');
    expect(result.metadata.compatibility?.platforms).toContain('codex');
  });

  it('should derive description from first paragraph when repo has no description', () => {
    const content = `# Rules

This is a comprehensive set of coding rules for working with Next.js applications in production environments.

## Section 1

Details here.`;

    const result = parseGenericInstructionFile(content, 'windsurfrules', {
      name: 'nextjs-rules',
      description: null,
      owner: 'owner',
    });

    expect(result.metadata.description).toContain('comprehensive set of coding rules');
    expect(result.metadata.compatibility?.platforms).toContain('windsurf');
  });

  it('should sanitize repo name to valid skill name', () => {
    const content = 'A long enough content to pass the minimum length requirement for the generic parser validation check that needs at least one hundred characters.';

    const result = parseGenericInstructionFile(content, 'copilot-instructions', {
      name: 'My Awesome Project!',
      description: 'desc',
      owner: 'owner',
    });

    expect(result.metadata.name).toBe('my-awesome-project');
  });

  it('should set author from repo owner when frontmatter has no author', () => {
    const content = 'A long enough content to pass the minimum length requirement. It needs to be at least one hundred characters long to be valid.';

    const result = parseGenericInstructionFile(content, 'cursorrules', {
      name: 'rules',
      description: 'My cursor rules',
      owner: 'johndoe',
    });

    expect(result.metadata.author).toBe('johndoe');
  });

  it('should generate fallback description when nothing else available', () => {
    // Content with only short paragraphs (< 20 chars each), separated by blank lines
    const content = Array.from({ length: 30 }, (_, i) => `word${i}\n`).join('\n');

    const result = parseGenericInstructionFile(content, 'cursorrules', {
      name: 'my-project',
      description: null,
      owner: 'johndoe',
    });

    expect(result.metadata.description).toBe('.cursorrules from johndoe/my-project');
  });
});

describe('INSTRUCTION_FILE_PATTERNS', () => {
  it('should have 5 patterns defined', () => {
    expect(INSTRUCTION_FILE_PATTERNS).toHaveLength(5);
  });

  it('should have unique formats', () => {
    const formats = INSTRUCTION_FILE_PATTERNS.map(p => p.format);
    expect(new Set(formats).size).toBe(formats.length);
  });

  it('should have skill.md as the first pattern', () => {
    expect(INSTRUCTION_FILE_PATTERNS[0].format).toBe('skill.md');
    expect(INSTRUCTION_FILE_PATTERNS[0].hasFrontmatter).toBe(true);
  });

  it('should mark root-only patterns correctly', () => {
    const rootOnly = INSTRUCTION_FILE_PATTERNS.filter(p => p.rootOnly);
    expect(rootOnly.map(p => p.format)).toEqual(['cursorrules', 'windsurfrules']);
  });
});
