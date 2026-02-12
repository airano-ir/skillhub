import * as os from 'os';
import * as path from 'path';
import fs from 'fs-extra';

export type Platform = 'claude' | 'codex' | 'copilot' | 'cursor' | 'windsurf';

const PLATFORM_PATHS: Record<Platform, { user: string; project: string }> = {
  claude: {
    user: '.claude/skills',
    project: '.claude/skills',
  },
  codex: {
    user: '.codex/skills',
    project: '.codex/skills',
  },
  copilot: {
    user: '.github/instructions',
    project: '.github/instructions',
  },
  cursor: {
    user: '.cursor/rules',
    project: '.cursor/rules',
  },
  windsurf: {
    user: '.windsurf/rules',
    project: '.windsurf/rules',
  },
};

const FLAT_FILE_PLATFORMS: Platform[] = ['cursor', 'windsurf', 'copilot'];

/**
 * Whether this platform uses a flat file structure
 * (skill file in base dir, tracking data in subdirectory)
 */
export function isFlatFilePlatform(platform: Platform): boolean {
  return FLAT_FILE_PLATFORMS.includes(platform);
}

/**
 * Get the path where the platform-specific skill file should be written.
 * For flat-file platforms, this is the base directory + fileName.
 * For subdirectory platforms, this is the skill's subdirectory + fileName.
 */
export function getPlatformFilePath(
  platform: Platform,
  skillName: string,
  fileName: string,
  project = false
): string {
  const basePath = getSkillsPath(platform, project);
  if (isFlatFilePlatform(platform)) {
    return path.join(basePath, fileName);
  }
  return path.join(basePath, skillName, fileName);
}

/**
 * Get the skills directory path for a platform
 */
export function getSkillsPath(platform: Platform, project = false): string {
  const home = os.homedir();
  const cwd = process.cwd();

  const paths = PLATFORM_PATHS[platform];

  if (project) {
    return path.join(cwd, paths.project);
  }

  return path.join(home, paths.user);
}

/**
 * Get the path for a specific skill
 */
export function getSkillPath(platform: Platform, skillName: string, project = false): string {
  const basePath = getSkillsPath(platform, project);
  return path.join(basePath, skillName);
}

/**
 * Ensure the skills directory exists
 */
export async function ensureSkillsDir(platform: Platform, project = false): Promise<string> {
  const skillsPath = getSkillsPath(platform, project);
  await fs.ensureDir(skillsPath);
  return skillsPath;
}

/**
 * Check if a skill is already installed
 */
export async function isSkillInstalled(
  platform: Platform,
  skillName: string,
  project = false
): Promise<boolean> {
  const skillPath = getSkillPath(platform, skillName, project);
  return fs.pathExists(skillPath);
}

/**
 * Detect which platform is being used in the current directory
 */
export async function detectPlatform(): Promise<Platform | null> {
  const cwd = process.cwd();

  for (const platform of Object.keys(PLATFORM_PATHS) as Platform[]) {
    const configPath = path.join(cwd, `.${platform}`);
    if (await fs.pathExists(configPath)) {
      return platform;
    }
  }

  // Check for common config files
  if (await fs.pathExists(path.join(cwd, '.github'))) {
    return 'copilot';
  }

  return null;
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  const home = os.homedir();
  return path.join(home, '.skillhub', 'config.json');
}

/**
 * Load CLI config
 */
export async function loadConfig(): Promise<Record<string, unknown>> {
  const configPath = getConfigPath();

  if (await fs.pathExists(configPath)) {
    return fs.readJson(configPath);
  }

  return {};
}

/**
 * Save CLI config
 */
export async function saveConfig(config: Record<string, unknown>): Promise<void> {
  const configPath = getConfigPath();
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
}
