import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { parseSkillMd, parseGenericInstructionFile, INSTRUCTION_FILE_PATTERNS, type SourceFormat } from 'skillhub-core';
import { getSkillPath, ensureSkillsDir, isSkillInstalled, isFlatFilePlatform, getPlatformFilePath, type Platform } from '../utils/paths.js';
import { getSkill, trackInstall, getSkillFiles, type SkillFilesResponse } from '../utils/api.js';
import { fetchSkillContent, getDefaultBranch, type SkillContent } from '../utils/github.js';
import { getPlatformFileName, transformForPlatform, shouldKeepOriginal } from '../utils/transform.js';

interface InstallOptions {
  platform: Platform;
  project?: boolean;
  force?: boolean;
  noApi?: boolean;
}

/**
 * Install a skill from the registry
 */
export async function install(skillId: string, options: InstallOptions): Promise<void> {
  const spinner = ora('Parsing skill ID...').start();

  try {
    // Parse skill ID
    const parts = skillId.split('/');
    if (parts.length < 2) {
      spinner.fail('Invalid skill ID format. Use: owner/repo or owner/repo/skill-name');
      process.exit(1);
    }

    const [owner, repo, ...rest] = parts;
    let skillPath = rest.join('/');

    // Try to get skill info from API (unless --no-api)
    let skillInfo;
    if (!options.noApi) {
      spinner.text = `Connecting to ${process.env.SKILLHUB_API_URL || 'https://skills.palebluedot.live'}...`;
      try {
        skillInfo = await getSkill(skillId);
        if (skillInfo) {
          spinner.succeed(`Found in registry: ${skillInfo.name}`);
          spinner.start('Preparing installation...');
        }
      } catch (error) {
        spinner.warn(`API unavailable: ${(error as Error).message}`);
        spinner.start('Falling back to direct GitHub fetch...');
      }
    } else {
      spinner.text = 'Skipping API lookup (--no-api flag)';
    }

    let skillName: string;
    let branch = 'main';
    let sourceFormat: SourceFormat = 'skill.md';

    if (skillInfo) {
      skillName = skillInfo.name;
      // Use the actual skillPath from database (e.g., 'skills/nuxt-ui' not 'nuxt-ui')
      skillPath = skillInfo.skillPath;
      branch = skillInfo.branch || 'main';
      sourceFormat = (skillInfo.sourceFormat as SourceFormat) || 'skill.md';
      spinner.text = `Found skill: ${chalk.cyan(skillName)}`;
    } else {
      // Fall back to fetching directly from GitHub
      spinner.text = 'Skill not in registry, fetching from GitHub...';
      try {
        branch = await getDefaultBranch(owner, repo);
        skillName = skillPath || repo;
      } catch (error) {
        spinner.fail('Failed to connect to GitHub');
        throw error;
      }
    }

    // Check if already installed
    const installed = await isSkillInstalled(options.platform, skillName, options.project);
    if (installed && !options.force) {
      spinner.fail(
        `Skill ${chalk.cyan(skillName)} is already installed. Use ${chalk.yellow('--force')} to overwrite.`
      );
      process.exit(1);
    }

    // Ensure skills directory exists
    await ensureSkillsDir(options.platform, options.project);

    // Fetch skill content - try API first, fall back to GitHub
    spinner.text = `Downloading ${skillInfo?.name || skillId}...`;
    let content: SkillContent | undefined;
    let apiWasReachable = false;

    // Try API first (unless --no-api)
    if (!options.noApi && skillInfo) {
      apiWasReachable = true; // API responded to getSkill, so it's reachable
      try {
        spinner.text = 'Downloading skill files...';
        const cachedFiles = await getSkillFiles(skillInfo.id);

        if (cachedFiles && cachedFiles.files.length > 0) {
          // Use sourceFormat from API response if available
          if (cachedFiles.sourceFormat) {
            sourceFormat = cachedFiles.sourceFormat as SourceFormat;
          }
          // Convert API response to SkillContent format
          const converted = convertCachedFilesToSkillContent(cachedFiles, sourceFormat);
          // Only use API result if the main instruction file was found
          if (converted.skillMd) {
            content = converted;
            spinner.text = cachedFiles.fromCache
              ? `Using cached files (${cachedFiles.files.length} files)`
              : `Downloaded ${cachedFiles.files.length} files via API`;
          } else {
            spinner.text = 'API returned files but main instruction file missing, falling back...';
          }
        }
      } catch {
        // API was reachable but file fetch failed (timeout, server error, etc.)
        spinner.text = 'API file fetch failed, falling back to GitHub...';
      }
    }

    // Fall back to direct GitHub fetch only if:
    // - API was not used (--no-api or skill not in registry)
    // - OR API file fetch returned empty/null (not a timeout - timeout means server is working on it)
    if (!content) {
      if (apiWasReachable) {
        // API was reachable but couldn't provide files - still try GitHub as last resort
        spinner.text = `Falling back to GitHub: ${owner}/${repo}/${skillPath || ''}...`;
      } else {
        spinner.text = `Downloading from GitHub: ${owner}/${repo}/${skillPath || ''}...`;
      }
      try {
        content = await fetchSkillContent(owner, repo, skillPath, branch, sourceFormat);
        spinner.text = `Downloaded ${content.scripts.length} scripts, ${content.references.length} references`;
      } catch (error) {
        spinner.fail('Failed to download skill files');
        console.error(chalk.red((error as Error).message));
        console.log();
        console.log(chalk.yellow('Troubleshooting tips:'));
        console.log(chalk.dim('  1. Check your internet connection'));
        if (apiWasReachable) {
          console.log(chalk.dim('  2. The API server could not fetch files either - try again in a minute'));
          console.log(chalk.dim('  3. The server may be caching the files now - retry shortly'));
        } else {
          console.log(chalk.dim('  2. If behind a proxy, configure HTTP_PROXY/HTTPS_PROXY environment variables'));
        }
        console.log(chalk.dim(`  ${apiWasReachable ? '4' : '3'}. Set GITHUB_TOKEN environment variable for higher rate limits`));
        process.exit(1);
      }
    }

    // Ensure content is available (TypeScript narrowing)
    if (!content) {
      spinner.fail('Failed to download skill content');
      process.exit(1);
    }

    // Parse and validate (format-aware)
    const parsed = sourceFormat === 'skill.md'
      ? parseSkillMd(content.skillMd)
      : parseGenericInstructionFile(content.skillMd, sourceFormat, {
          name: skillName,
          description: skillInfo?.description || null,
          owner,
        });
    if (!parsed.validation.isValid) {
      spinner.warn('Skill has validation issues:');
      for (const error of parsed.validation.errors) {
        console.log(chalk.yellow(`  - ${error.message}`));
      }
    }

    // Get the actual skill name from metadata
    const actualName = parsed.metadata.name || skillName;
    const installPath = getSkillPath(options.platform, actualName, options.project);

    // Check for name collision with different skill
    const metadataPath = path.join(installPath, '.skillhub.json');
    if (await fs.pathExists(metadataPath)) {
      try {
        const existingMetadata = await fs.readJson(metadataPath);
        if (existingMetadata.skillId && existingMetadata.skillId !== skillId) {
          spinner.warn(`Name collision detected!`);
          console.log(chalk.yellow(`\nA different skill is already installed with the name "${actualName}":`));
          console.log(chalk.dim(`  Existing: ${existingMetadata.skillId}`));
          console.log(chalk.dim(`  New:      ${skillId}`));
          console.log();

          if (!options.force) {
            console.log(chalk.red('Installation cancelled to prevent overwriting.'));
            console.log(chalk.dim('Use --force to overwrite the existing skill.'));
            process.exit(1);
          } else {
            console.log(chalk.yellow('Overwriting existing skill (--force flag used).\n'));
          }
        }
      } catch {
        // Ignore metadata read errors
      }
    }

    // Remove existing if force
    if (installed && options.force) {
      await fs.remove(installPath);
    }

    // Create skill directory and write files
    spinner.text = 'Installing skill...';
    await fs.ensureDir(installPath);

    // Transform content for target platform
    const platformFileName = getPlatformFileName(options.platform, actualName);
    const { content: transformedContent, warnings: transformWarnings } =
      transformForPlatform(options.platform, content.skillMd, parsed);

    for (const warning of transformWarnings) {
      console.log(chalk.yellow(`  Warning: ${warning}`));
    }

    // Write the platform-specific file
    if (isFlatFilePlatform(options.platform)) {
      const platformFilePath = getPlatformFilePath(
        options.platform, actualName, platformFileName, options.project
      );
      await fs.writeFile(platformFilePath, transformedContent);
    } else {
      await fs.writeFile(path.join(installPath, platformFileName), transformedContent);
    }

    // Keep original SKILL.md in tracking directory for re-transformation
    if (shouldKeepOriginal(options.platform)) {
      await fs.writeFile(path.join(installPath, 'SKILL.md'), content.skillMd);
    }

    // Write metadata file for update tracking
    // Use canonical ID from registry if available for proper tracking
    const canonicalId = skillInfo?.id || skillId;
    const platformFilePath = isFlatFilePlatform(options.platform)
      ? getPlatformFilePath(options.platform, actualName, platformFileName, options.project)
      : null;
    await fs.writeJson(path.join(installPath, '.skillhub.json'), {
      skillId: canonicalId,
      installedAt: new Date().toISOString(),
      platform: options.platform,
      version: parsed.metadata.version || null,
      platformFileName,
      platformFilePath,
    });

    // Write scripts
    if (content.scripts.length > 0) {
      const scriptsDir = path.join(installPath, 'scripts');
      await fs.ensureDir(scriptsDir);

      for (const script of content.scripts) {
        const scriptPath = path.join(scriptsDir, script.name);
        await fs.writeFile(scriptPath, script.content);
        await fs.chmod(scriptPath, '755');
      }
    }

    // Write references
    if (content.references.length > 0) {
      const refsDir = path.join(installPath, 'references');
      await fs.ensureDir(refsDir);

      for (const ref of content.references) {
        await fs.writeFile(path.join(refsDir, ref.name), ref.content);
      }
    }

    // Track installation using canonical skill ID from registry (if available)
    // This ensures the tracking matches the database record
    const trackingId = skillInfo?.id || skillId;
    await trackInstall(trackingId, options.platform, 'cli');

    spinner.succeed(`Skill ${chalk.green(actualName)} installed successfully!`);

    // Print info
    console.log();
    console.log(chalk.dim(`Path: ${installPath}`));
    console.log();

    if (parsed.metadata.description) {
      console.log(chalk.dim(parsed.metadata.description));
      console.log();
    }

    console.log(chalk.yellow('Usage:'));
    console.log(
      `  This skill will be automatically activated when your ${getPlatformName(options.platform)} agent recognizes it's relevant.`
    );

    const setupInstructions = getPlatformSetupInstructions(options.platform, installPath);
    if (setupInstructions) {
      console.log();
      console.log(chalk.cyan('Next Steps:'));
      console.log(setupInstructions);
    }

    if (content.scripts.length > 0) {
      console.log();
      console.log(chalk.dim(`Scripts: ${content.scripts.map((s) => s.name).join(', ')}`));
    }
  } catch (error) {
    spinner.fail('Installation failed');
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    claude: 'Claude',
    codex: 'OpenAI Codex',
    copilot: 'GitHub Copilot',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
  };
  return names[platform];
}

function getPlatformSetupInstructions(platform: Platform, installPath: string): string | null {
  switch (platform) {
    case 'claude':
      return chalk.dim('  Skills in .claude/skills/ are automatically discovered by Claude Code.');
    case 'codex':
      return chalk.dim(`  Reference this skill in your AGENTS.md:\n  @import ${installPath}/SKILL.md`);
    case 'copilot':
      return chalk.dim('  Instructions in .github/instructions/ are automatically loaded by GitHub Copilot.');
    case 'cursor':
      return chalk.dim('  Rules in .cursor/rules/ are automatically loaded by Cursor.');
    case 'windsurf':
      return chalk.dim('  Rules in .windsurf/rules/ are automatically loaded by Windsurf.');
    default:
      return null;
  }
}

/**
 * All known main instruction file names across platforms
 */
const MAIN_FILE_NAMES = INSTRUCTION_FILE_PATTERNS.map(p => p.filename);

/**
 * Convert cached files API response to SkillContent format.
 * Detects the main instruction file by name (SKILL.md, AGENTS.md, .cursorrules, etc.)
 */
function convertCachedFilesToSkillContent(
  response: SkillFilesResponse,
  sourceFormat: SourceFormat = 'skill.md'
): SkillContent {
  let skillMd = '';
  const scripts: SkillContent['scripts'] = [];
  const references: SkillContent['references'] = [];

  // Find the expected main filename for this format
  const expectedPattern = INSTRUCTION_FILE_PATTERNS.find(p => p.format === sourceFormat);
  const expectedFilename = expectedPattern?.filename || 'SKILL.md';

  for (const file of response.files) {
    // Skip files without content (binary files)
    if (!file.content) continue;

    // Main instruction file: match expected filename or any known instruction file
    if (!skillMd && (file.name === expectedFilename || MAIN_FILE_NAMES.includes(file.name)) &&
        file.path === file.name) {
      skillMd = file.content;
      continue;
    }

    // Scripts folder
    if (file.path.startsWith('scripts/')) {
      scripts.push({
        name: file.name,
        content: file.content,
      });
      continue;
    }

    // References folder
    if (file.path.startsWith('references/')) {
      references.push({
        name: file.name,
        content: file.content,
      });
    }
  }

  return {
    skillMd,
    scripts,
    references,
    assets: [],
  };
}
