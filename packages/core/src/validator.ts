import type {
  ParsedSkill,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SkillResources,
} from './types.js';

/**
 * Perform deep validation of a parsed skill
 */
export function validateSkill(skill: ParsedSkill): ValidationResult {
  const errors: ValidationError[] = [...skill.validation.errors];
  const warnings: ValidationWarning[] = [...skill.validation.warnings];

  // Validate content
  validateContent(skill.content, errors, warnings);

  // Validate resources
  validateResources(skill.resources, warnings);

  // Check for best practices
  checkBestPractices(skill, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateContent(
  content: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (!content || content.trim().length === 0) {
    errors.push({
      code: 'EMPTY_CONTENT',
      message: 'Skill content is empty',
    });
    return;
  }

  if (content.length < 50) {
    warnings.push({
      code: 'CONTENT_TOO_SHORT',
      message: 'Skill content is very short',
      suggestion: 'Add more detailed instructions for the AI agent',
    });
  }

  // Check for required sections
  const hasInstructions =
    content.includes('##') || content.includes('# ') || content.length > 200;

  if (!hasInstructions) {
    warnings.push({
      code: 'NO_SECTIONS',
      message: 'Content lacks structured sections',
      suggestion: 'Consider organizing content with markdown headers',
    });
  }

  // Check for placeholder content
  const placeholders = ['TODO', 'FIXME', 'XXX', 'PLACEHOLDER', '[INSERT'];
  for (const placeholder of placeholders) {
    if (content.toUpperCase().includes(placeholder)) {
      warnings.push({
        code: 'PLACEHOLDER_CONTENT',
        message: `Content contains placeholder text: ${placeholder}`,
        suggestion: 'Replace placeholder content before publishing',
      });
    }
  }
}

function validateResources(resources: SkillResources, warnings: ValidationWarning[]): void {
  // Check script file extensions
  for (const script of resources.scripts) {
    const ext = script.name.split('.').pop()?.toLowerCase();
    const validExts = ['sh', 'bash', 'py', 'js', 'ts', 'rb', 'ps1'];

    if (ext && !validExts.includes(ext)) {
      warnings.push({
        code: 'UNUSUAL_SCRIPT_EXT',
        message: `Script has unusual extension: ${script.name}`,
        suggestion: `Consider using one of: ${validExts.join(', ')}`,
      });
    }
  }

  // Check reference file sizes (if content is available)
  for (const ref of resources.references) {
    if (ref.content && ref.content.length > 100000) {
      warnings.push({
        code: 'LARGE_REFERENCE',
        message: `Reference file is very large: ${ref.name}`,
        suggestion: 'Consider splitting into smaller files',
      });
    }
  }

  // Check for required files
  if (resources.scripts.length === 0 && resources.references.length === 0) {
    // This is fine - not all skills need external resources
  }
}

function checkBestPractices(skill: ParsedSkill, warnings: ValidationWarning[]): void {
  const { metadata, content } = skill;

  // Check for version
  if (!metadata.version) {
    warnings.push({
      code: 'NO_VERSION',
      message: 'No version specified',
      suggestion: 'Add a version field for better tracking',
    });
  }

  // Check for license
  if (!metadata.license) {
    warnings.push({
      code: 'NO_LICENSE',
      message: 'No license specified',
      suggestion: 'Add a license field (e.g., MIT, Apache-2.0)',
    });
  }

  // Check for platform compatibility
  if (!metadata.compatibility?.platforms || metadata.compatibility.platforms.length === 0) {
    warnings.push({
      code: 'NO_PLATFORMS',
      message: 'No platforms specified in compatibility',
      suggestion: 'Specify which AI platforms this skill supports',
    });
  }

  // Check for examples in content
  const hasExamples =
    content.toLowerCase().includes('example') ||
    content.includes('```') ||
    content.toLowerCase().includes('usage');

  if (!hasExamples) {
    warnings.push({
      code: 'NO_EXAMPLES',
      message: 'Content lacks examples',
      suggestion: 'Add usage examples to help users understand the skill',
    });
  }

  // Check content organization
  const headers = content.match(/^#+\s+.+$/gm) || [];
  if (content.length > 500 && headers.length < 2) {
    warnings.push({
      code: 'POOR_ORGANIZATION',
      message: 'Long content with few headers',
      suggestion: 'Break up content with more section headers',
    });
  }
}

/**
 * Quick validation check - returns true if skill appears valid
 */
export function isValidSkill(skill: ParsedSkill): boolean {
  return skill.validation.isValid;
}

/**
 * Get a human-readable summary of validation issues
 */
export function formatValidationSummary(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.isValid) {
    lines.push('Skill is valid');
  } else {
    lines.push('Skill has validation errors:');
  }

  for (const error of result.errors) {
    lines.push(`  ERROR: ${error.message}${error.field ? ` (${error.field})` : ''}`);
  }

  for (const warning of result.warnings) {
    lines.push(`  WARNING: ${warning.message}`);
    if (warning.suggestion) {
      lines.push(`    Suggestion: ${warning.suggestion}`);
    }
  }

  return lines.join('\n');
}
