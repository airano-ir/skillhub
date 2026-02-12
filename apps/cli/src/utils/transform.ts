import type { Platform } from './paths.js';
import type { ParsedSkill } from 'skillhub-core';

interface TransformResult {
  content: string;
  warnings: string[];
}

interface PlatformFileConfig {
  getFileName: (skillName: string) => string;
  keepOriginal: boolean;
  transform: (rawSkillMd: string, parsed: ParsedSkill) => TransformResult;
}

const WINDSURF_CHAR_LIMIT = 6000;

const PLATFORM_FILE_CONFIGS: Record<Platform, PlatformFileConfig> = {
  claude: {
    getFileName: () => 'SKILL.md',
    keepOriginal: false,
    transform: (raw) => ({ content: raw, warnings: [] }),
  },
  codex: {
    getFileName: () => 'SKILL.md',
    keepOriginal: false,
    transform: (raw) => ({ content: raw, warnings: [] }),
  },
  cursor: {
    getFileName: (skillName) => `${skillName}.mdc`,
    keepOriginal: true,
    transform: transformForCursor,
  },
  windsurf: {
    getFileName: (skillName) => `${skillName}.md`,
    keepOriginal: true,
    transform: transformForWindsurf,
  },
  copilot: {
    getFileName: (skillName) => `${skillName}.instructions.md`,
    keepOriginal: true,
    transform: transformForCopilot,
  },
};

/**
 * Get the platform-specific output filename
 */
export function getPlatformFileName(platform: Platform, skillName: string): string {
  return PLATFORM_FILE_CONFIGS[platform].getFileName(skillName);
}

/**
 * Transform SKILL.md content for a target platform
 */
export function transformForPlatform(
  platform: Platform,
  rawSkillMd: string,
  parsed: ParsedSkill
): TransformResult {
  return PLATFORM_FILE_CONFIGS[platform].transform(rawSkillMd, parsed);
}

/**
 * Whether the platform needs the original SKILL.md kept alongside
 */
export function shouldKeepOriginal(platform: Platform): boolean {
  return PLATFORM_FILE_CONFIGS[platform].keepOriginal;
}

/**
 * Convert SKILL.md to Cursor's MDC format
 * MDC uses its own frontmatter: description, globs, alwaysApply
 */
function transformForCursor(_raw: string, parsed: ParsedSkill): TransformResult {
  const warnings: string[] = [];
  const mdcFields: string[] = [];

  if (parsed.metadata.description) {
    mdcFields.push(`description: ${parsed.metadata.description}`);
  }

  const filePatterns = parsed.metadata.triggers?.filePatterns;
  if (filePatterns && filePatterns.length > 0) {
    mdcFields.push(`globs: ${filePatterns.join(', ')}`);
    mdcFields.push('alwaysApply: false');
  } else {
    mdcFields.push('alwaysApply: true');
  }

  const body = parsed.content.trim();
  const mdcContent = `---\n${mdcFields.join('\n')}\n---\n${body}\n`;
  return { content: mdcContent, warnings };
}

/**
 * Convert SKILL.md to Windsurf format: plain markdown, 6K char limit
 */
function transformForWindsurf(_raw: string, parsed: ParsedSkill): TransformResult {
  const warnings: string[] = [];
  let body = parsed.content.trim();

  if (!body.startsWith('# ')) {
    body = `# ${parsed.metadata.name}\n\n${body}`;
  }

  if (body.length > WINDSURF_CHAR_LIMIT) {
    warnings.push(
      `Content exceeds Windsurf's ${WINDSURF_CHAR_LIMIT} character limit (${body.length} chars). Truncating.`
    );
    body = truncateAtSectionBoundary(body, WINDSURF_CHAR_LIMIT);
  }

  return { content: body + '\n', warnings };
}

/**
 * Convert SKILL.md to Copilot format: plain markdown, no frontmatter
 */
function transformForCopilot(_raw: string, parsed: ParsedSkill): TransformResult {
  let body = parsed.content.trim();

  if (!body.startsWith('# ')) {
    body = `# ${parsed.metadata.name}\n\n${body}`;
  }

  return { content: body + '\n', warnings: [] };
}

function truncateAtSectionBoundary(content: string, limit: number): string {
  const notice = '\n\n<!-- Truncated by SkillHub: see SKILL.md for full content -->\n';
  const maxLen = limit - notice.length;

  if (content.length <= maxLen) return content;

  const truncated = content.slice(0, maxLen);
  const lastHeading = truncated.lastIndexOf('\n## ');
  const lastH1 = truncated.lastIndexOf('\n# ');
  const cutPoint = Math.max(lastHeading, lastH1);

  if (cutPoint > 0) {
    return truncated.slice(0, cutPoint) + notice;
  }

  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > 0) {
    return truncated.slice(0, lastParagraph) + notice;
  }

  return truncated + notice;
}
