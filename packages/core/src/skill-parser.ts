import matter from 'gray-matter';
import type {
  ParsedSkill,
  SkillMetadata,
  SkillResources,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SkillPlatform,
  SourceFormat,
  InstructionFilePattern,
} from './types.js';

const VALID_PLATFORMS: SkillPlatform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_NAME_LENGTH = 64;

/**
 * File patterns for discovering instruction files on GitHub
 */
export const INSTRUCTION_FILE_PATTERNS: InstructionFilePattern[] = [
  {
    format: 'skill.md',
    filename: 'SKILL.md',
    searchQuery: 'filename:SKILL.md',
    rootOnly: false,
    hasFrontmatter: true,
    inferredPlatform: 'claude',
    minContentLength: 50,
  },
  {
    format: 'agents.md',
    filename: 'AGENTS.md',
    searchQuery: 'filename:AGENTS.md',
    rootOnly: false,
    hasFrontmatter: false,
    inferredPlatform: 'codex',
    minContentLength: 100,
  },
  {
    format: 'copilot-instructions',
    filename: 'copilot-instructions.md',
    searchQuery: 'filename:copilot-instructions.md path:.github',
    pathFilter: '.github/',
    rootOnly: false,
    hasFrontmatter: false,
    inferredPlatform: 'copilot',
    minContentLength: 100,
  },
  {
    format: 'cursorrules',
    filename: '.cursorrules',
    searchQuery: 'filename:.cursorrules',
    rootOnly: true,
    hasFrontmatter: false,
    inferredPlatform: 'cursor',
    minContentLength: 100,
  },
  {
    format: 'windsurfrules',
    filename: '.windsurfrules',
    searchQuery: 'filename:.windsurfrules',
    rootOnly: true,
    hasFrontmatter: false,
    inferredPlatform: 'windsurf',
    minContentLength: 100,
  },
];

export const FORMAT_LABELS: Record<SourceFormat, string> = {
  'skill.md': 'SKILL.md',
  'agents.md': 'AGENTS.md',
  'cursorrules': '.cursorrules',
  'windsurfrules': '.windsurfrules',
  'copilot-instructions': 'Copilot Instructions',
};

/**
 * Parse a SKILL.md file content into a structured skill object
 */
export function parseSkillMd(content: string): ParsedSkill {
  const { data: frontmatter, content: body } = matter(content);

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate required fields
  if (!frontmatter.name) {
    errors.push({
      code: 'MISSING_NAME',
      message: 'Missing required field: name',
      field: 'name',
    });
  } else {
    validateName(frontmatter.name, errors, warnings);
  }

  if (!frontmatter.description) {
    errors.push({
      code: 'MISSING_DESCRIPTION',
      message: 'Missing required field: description',
      field: 'description',
    });
  } else {
    validateDescription(frontmatter.description, warnings);
  }

  // Validate optional fields
  if (frontmatter.compatibility) {
    validateCompatibility(frontmatter.compatibility, errors, warnings);
  }

  if (frontmatter.triggers) {
    validateTriggers(frontmatter.triggers, warnings);
  }

  // Build metadata
  const metadata: SkillMetadata = {
    name: String(frontmatter.name || ''),
    description: String(frontmatter.description || ''),
    version: frontmatter.version ? String(frontmatter.version) : undefined,
    license: frontmatter.license ? String(frontmatter.license) : undefined,
    author: frontmatter.author ? String(frontmatter.author) : undefined,
    homepage: frontmatter.homepage ? String(frontmatter.homepage) : undefined,
    repository: frontmatter.repository ? String(frontmatter.repository) : undefined,
    compatibility: frontmatter.compatibility as SkillMetadata['compatibility'],
    triggers: frontmatter.triggers as SkillMetadata['triggers'],
    metadata: frontmatter.metadata as Record<string, unknown>,
  };

  // Discover resources from content (placeholders - actual files loaded separately)
  const resources = discoverResources(body);

  const validation: ValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
  };

  return {
    metadata,
    content: body.trim(),
    resources,
    validation,
    rawFrontmatter: frontmatter,
  };
}

function validateName(
  name: unknown,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (typeof name !== 'string') {
    errors.push({
      code: 'INVALID_NAME_TYPE',
      message: 'Name must be a string',
      field: 'name',
    });
    return;
  }

  if (name.length > MAX_NAME_LENGTH) {
    errors.push({
      code: 'NAME_TOO_LONG',
      message: `Name exceeds ${MAX_NAME_LENGTH} characters`,
      field: 'name',
    });
  }

  if (!NAME_PATTERN.test(name)) {
    errors.push({
      code: 'INVALID_NAME_FORMAT',
      message: 'Name must be lowercase alphanumeric with hyphens (e.g., "my-skill")',
      field: 'name',
    });
  }

  // Check for reserved names
  const reserved = ['test', 'example', 'demo', 'skill', 'template'];
  if (reserved.includes(name)) {
    warnings.push({
      code: 'RESERVED_NAME',
      message: `"${name}" is a reserved name and may cause conflicts`,
      field: 'name',
      suggestion: `Consider using a more specific name like "my-${name}"`,
    });
  }
}

function validateDescription(description: unknown, warnings: ValidationWarning[]): void {
  if (typeof description !== 'string') {
    return;
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push({
      code: 'DESCRIPTION_TOO_LONG',
      message: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
      field: 'description',
      suggestion: 'Consider shortening the description for better display',
    });
  }

  if (description.length < 20) {
    warnings.push({
      code: 'DESCRIPTION_TOO_SHORT',
      message: 'Description is very short',
      field: 'description',
      suggestion: 'Add more detail to help users understand the skill',
    });
  }
}

function validateCompatibility(
  compatibility: unknown,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (typeof compatibility !== 'object' || compatibility === null) {
    errors.push({
      code: 'INVALID_COMPATIBILITY',
      message: 'Compatibility must be an object',
      field: 'compatibility',
    });
    return;
  }

  const compat = compatibility as Record<string, unknown>;

  if (compat.platforms) {
    if (!Array.isArray(compat.platforms)) {
      errors.push({
        code: 'INVALID_PLATFORMS',
        message: 'Platforms must be an array',
        field: 'compatibility.platforms',
      });
    } else {
      for (const platform of compat.platforms) {
        if (!VALID_PLATFORMS.includes(platform as SkillPlatform)) {
          warnings.push({
            code: 'UNKNOWN_PLATFORM',
            message: `Unknown platform: ${platform}`,
            field: 'compatibility.platforms',
            suggestion: `Valid platforms are: ${VALID_PLATFORMS.join(', ')}`,
          });
        }
      }
    }
  }
}

function validateTriggers(triggers: unknown, warnings: ValidationWarning[]): void {
  if (typeof triggers !== 'object' || triggers === null) {
    return;
  }

  const trig = triggers as Record<string, unknown>;

  if (trig.filePatterns && !Array.isArray(trig.filePatterns)) {
    warnings.push({
      code: 'INVALID_FILE_PATTERNS',
      message: 'filePatterns should be an array',
      field: 'triggers.filePatterns',
    });
  }

  if (trig.keywords && !Array.isArray(trig.keywords)) {
    warnings.push({
      code: 'INVALID_KEYWORDS',
      message: 'keywords should be an array',
      field: 'triggers.keywords',
    });
  }
}

function discoverResources(content: string): SkillResources {
  const scripts: SkillResources['scripts'] = [];
  const references: SkillResources['references'] = [];
  const assets: SkillResources['assets'] = [];

  // Look for script references in content
  const scriptPattern = /scripts\/([a-zA-Z0-9_-]+\.(sh|py|js|ts))/g;
  let match;
  while ((match = scriptPattern.exec(content)) !== null) {
    scripts.push({
      name: match[1],
      path: `scripts/${match[1]}`,
    });
  }

  // Look for reference file mentions
  const refPattern = /references\/([a-zA-Z0-9_.-]+)/g;
  while ((match = refPattern.exec(content)) !== null) {
    references.push({
      name: match[1],
      path: `references/${match[1]}`,
    });
  }

  // Look for asset references
  const assetPattern = /assets\/([a-zA-Z0-9_.-]+)/g;
  while ((match = assetPattern.exec(content)) !== null) {
    assets.push({
      name: match[1],
      path: `assets/${match[1]}`,
    });
  }

  return { scripts, references, assets };
}

/**
 * Extract just the metadata from a SKILL.md without full parsing
 */
export function extractMetadata(content: string): SkillMetadata | null {
  try {
    const { data } = matter(content);

    if (!data.name || !data.description) {
      return null;
    }

    return {
      name: String(data.name),
      description: String(data.description),
      version: data.version ? String(data.version) : undefined,
      license: data.license ? String(data.license) : undefined,
      author: data.author ? String(data.author) : undefined,
      compatibility: data.compatibility as SkillMetadata['compatibility'],
      triggers: data.triggers as SkillMetadata['triggers'],
    };
  } catch {
    return null;
  }
}

/**
 * Parse a generic instruction file (non-SKILL.md) into a ParsedSkill.
 * Creates synthetic metadata from file content and repo information.
 */
export function parseGenericInstructionFile(
  content: string,
  format: SourceFormat,
  repoMeta: { name: string; description: string | null; owner: string }
): ParsedSkill {
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  // Try gray-matter in case the file has frontmatter (AGENTS.md sometimes does)
  try {
    const parsed = matter(content);
    if (parsed.data && Object.keys(parsed.data).length > 0) {
      frontmatter = parsed.data;
      body = parsed.content;
    }
  } catch {
    // No frontmatter, use raw content
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const pattern = INSTRUCTION_FILE_PATTERNS.find(p => p.format === format);
  const minLen = pattern?.minContentLength || 100;

  // Quality filter: minimum content length
  if (body.trim().length < minLen) {
    errors.push({
      code: 'CONTENT_TOO_SHORT',
      message: `Content is too short for ${FORMAT_LABELS[format]} (minimum ${minLen} chars)`,
    });
  }

  // Derive name: prefer frontmatter, then repo name, sanitized
  const rawName = (frontmatter.name as string) || repoMeta.name;
  const derivedName = sanitizeToSkillName(rawName);

  // Derive description: prefer frontmatter > repo description > first paragraph
  const derivedDescription =
    (frontmatter.description as string) ||
    repoMeta.description ||
    extractFirstParagraph(body) ||
    `${FORMAT_LABELS[format]} from ${repoMeta.owner}/${repoMeta.name}`;

  const inferredPlatform = pattern?.inferredPlatform || 'claude';

  const metadata: SkillMetadata = {
    name: derivedName,
    description: derivedDescription.slice(0, MAX_DESCRIPTION_LENGTH),
    version: frontmatter.version ? String(frontmatter.version) : undefined,
    license: frontmatter.license ? String(frontmatter.license) : undefined,
    author: frontmatter.author ? String(frontmatter.author) : repoMeta.owner,
    compatibility: {
      platforms: [inferredPlatform],
    },
  };

  const resources = discoverResources(body);

  return {
    metadata,
    content: body.trim(),
    resources,
    validation: {
      isValid: errors.length === 0,
      errors,
      warnings,
    },
    rawFrontmatter: frontmatter,
  };
}

/**
 * Convert a repo name to a valid skill name (lowercase kebab-case)
 */
function sanitizeToSkillName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_NAME_LENGTH) || 'skill';
}

/**
 * Extract the first meaningful paragraph (>= 20 chars) from markdown content
 */
function extractFirstParagraph(content: string): string | null {
  const lines = content.split('\n');
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      if (current.length >= 20) {
        return current.trim();
      }
      current = '';
      continue;
    }
    current += ' ' + trimmed;
  }

  if (current.length >= 20) {
    return current.trim();
  }

  return null;
}

/**
 * Validate a skill ID format (owner/repo/skill-name)
 */
export function isValidSkillId(id: string): boolean {
  const parts = id.split('/');
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }

  // Validate each part
  return parts.every((part) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(part));
}

/**
 * Parse a skill ID into components
 */
export function parseSkillId(id: string): { owner: string; repo: string; name?: string } | null {
  const parts = id.split('/');

  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }

  if (parts.length === 3) {
    return { owner: parts[0], repo: parts[1], name: parts[2] };
  }

  return null;
}
