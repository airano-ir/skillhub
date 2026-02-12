import { describe, it, expect } from 'vitest';
import { validateSkill, isValidSkill, formatValidationSummary } from './validator.js';
import type { ParsedSkill } from './types.js';

// Helper function to create a mock parsed skill
function createMockSkill(overrides: Partial<ParsedSkill> = {}): ParsedSkill {
  return {
    metadata: {
      name: 'test-skill',
      description: 'A test skill',
      version: '1.0.0',
      license: 'MIT',
      compatibility: {
        platforms: ['claude', 'codex'],
      },
      ...overrides.metadata,
    },
    content: `# Test Skill

This is a test skill with good content structure.

## Usage

Here's how to use this skill with an example:

\`\`\`bash
npx skillhub install test/test-skill
\`\`\`
`,
    resources: {
      scripts: [],
      references: [],
      ...overrides.resources,
    },
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      ...overrides.validation,
    },
    ...overrides,
  };
}

describe('validateSkill', () => {
  it('should return valid for a well-formed skill', () => {
    const skill = createMockSkill();
    const result = validateSkill(skill);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect empty content', () => {
    const skill = createMockSkill({ content: '' });
    const result = validateSkill(skill);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'EMPTY_CONTENT')).toBe(true);
  });

  it('should warn about short content', () => {
    const skill = createMockSkill({ content: 'Very short.' });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'CONTENT_TOO_SHORT')).toBe(true);
  });

  it('should warn about placeholder content', () => {
    const skill = createMockSkill({
      content: `# Test Skill

TODO: Add more content here.

## Usage

FIXME: Write usage instructions.
`,
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'PLACEHOLDER_CONTENT')).toBe(true);
  });

  it('should warn about missing version', () => {
    const skill = createMockSkill({
      metadata: {
        name: 'test-skill',
        description: 'A test skill',
        version: undefined,
      },
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'NO_VERSION')).toBe(true);
  });

  it('should warn about missing license', () => {
    const skill = createMockSkill({
      metadata: {
        name: 'test-skill',
        description: 'A test skill',
        license: undefined,
      },
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'NO_LICENSE')).toBe(true);
  });

  it('should warn about missing platforms', () => {
    const skill = createMockSkill({
      metadata: {
        name: 'test-skill',
        description: 'A test skill',
        compatibility: {},
      },
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'NO_PLATFORMS')).toBe(true);
  });

  it('should warn about unusual script extensions', () => {
    const skill = createMockSkill({
      resources: {
        scripts: [{ name: 'script.xyz', content: 'echo hello' }],
        references: [],
      },
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'UNUSUAL_SCRIPT_EXT')).toBe(true);
  });

  it('should warn about large reference files', () => {
    const skill = createMockSkill({
      resources: {
        scripts: [],
        references: [{ name: 'huge-file.md', content: 'x'.repeat(150000) }],
      },
    });
    const result = validateSkill(skill);

    expect(result.warnings.some(w => w.code === 'LARGE_REFERENCE')).toBe(true);
  });
});

describe('isValidSkill', () => {
  it('should return true for valid skills', () => {
    const skill = createMockSkill();
    expect(isValidSkill(skill)).toBe(true);
  });

  it('should return false for invalid skills', () => {
    const skill = createMockSkill({
      validation: {
        isValid: false,
        errors: [{ code: 'MISSING_NAME', message: 'Name is required' }],
        warnings: [],
      },
    });
    expect(isValidSkill(skill)).toBe(false);
  });
});

describe('formatValidationSummary', () => {
  it('should format valid skill summary', () => {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    const summary = formatValidationSummary(result);

    expect(summary).toContain('Skill is valid');
  });

  it('should format errors and warnings', () => {
    const result = {
      isValid: false,
      errors: [{ code: 'EMPTY_CONTENT', message: 'Content is empty' }],
      warnings: [{ code: 'NO_LICENSE', message: 'No license', suggestion: 'Add MIT' }],
    };
    const summary = formatValidationSummary(result);

    expect(summary).toContain('ERROR: Content is empty');
    expect(summary).toContain('WARNING: No license');
    expect(summary).toContain('Suggestion: Add MIT');
  });
});
