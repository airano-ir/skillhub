/**
 * Skill metadata extracted from SKILL.md frontmatter
 */
export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  license?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  compatibility?: {
    platforms?: SkillPlatform[];
    requires?: string[];
    minVersion?: string;
  };
  triggers?: {
    filePatterns?: string[];
    keywords?: string[];
    languages?: string[];
  };
  metadata?: Record<string, unknown>;
}

/**
 * Supported AI agent platforms
 */
export type SkillPlatform = 'claude' | 'codex' | 'copilot' | 'cursor' | 'windsurf';

/**
 * Resource files associated with a skill
 */
export interface SkillResources {
  scripts: SkillScript[];
  references: SkillReference[];
  assets: SkillAsset[];
}

export interface SkillScript {
  name: string;
  path: string;
  content?: string;
  language?: string;
}

export interface SkillReference {
  name: string;
  path: string;
  content?: string;
}

export interface SkillAsset {
  name: string;
  path: string;
  contentBase64?: string;
  mimeType?: string;
}

/**
 * Validation result for a skill
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  line?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * Fully parsed skill with all components
 */
export interface ParsedSkill {
  metadata: SkillMetadata;
  content: string;
  resources: SkillResources;
  validation: ValidationResult;
  rawFrontmatter: Record<string, unknown>;
}

/**
 * Security status categories
 */
export type SecurityStatus = 'pass' | 'warning' | 'fail';

/**
 * Security scan result
 */
export interface SecurityReport {
  score: number; // 0-100 (deprecated, use status instead)
  status: SecurityStatus; // PASS, WARNING, or FAIL
  issues: SecurityIssue[];
  recommendations: string[];
  scannedAt: Date;
}

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: SecurityIssueType;
  description: string;
  location?: string;
  line?: number;
}

export type SecurityIssueType =
  | 'destructive_command'
  | 'remote_execution'
  | 'download_execute'
  | 'eval_usage'
  | 'exec_usage'
  | 'shell_injection'
  | 'prompt_injection'
  | 'data_exfiltration'
  | 'credential_exposure'
  | 'unsafe_permissions';

/**
 * Installation paths for different platforms
 */
export interface PlatformPaths {
  claude: string;
  codex: string;
  copilot: string;
  cursor: string;
  windsurf: string;
}

/**
 * Source format of the instruction file
 */
export type SourceFormat = 'skill.md' | 'agents.md' | 'cursorrules' | 'windsurfrules' | 'copilot-instructions';

/**
 * Pattern definition for discovering instruction files on GitHub
 */
export interface InstructionFilePattern {
  format: SourceFormat;
  filename: string;
  searchQuery: string;
  pathFilter?: string;
  rootOnly: boolean;
  hasFrontmatter: boolean;
  inferredPlatform: SkillPlatform;
  minContentLength: number;
}

/**
 * Skill source information (GitHub)
 */
export interface SkillSource {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  commit?: string;
  sourceFormat?: SourceFormat;
}
