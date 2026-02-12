import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { parseSkillMd } from 'skillhub-core';
import { getSkillsPath, type Platform } from '../utils/paths.js';

interface ListOptions {
  platform?: Platform;
  project?: boolean;
  all?: boolean;
}

const ALL_PLATFORMS: Platform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];

/**
 * List installed skills
 */
export async function list(options: ListOptions): Promise<void> {
  const platforms = options.platform ? [options.platform] : ALL_PLATFORMS;
  let totalSkills = 0;

  // Determine which locations to check
  const checkGlobal = options.all || !options.project;
  const checkProject = options.all || options.project;

  // List global skills
  if (checkGlobal) {
    for (const platform of platforms) {
      const skills = await getInstalledSkills(platform, false);

      if (skills.length === 0) {
        continue;
      }

      totalSkills += skills.length;

      const header = options.all
        ? `${getPlatformName(platform)} - Global (${skills.length} skills)`
        : `${getPlatformName(platform)} (${skills.length} skills)`;

      console.log(chalk.bold(`\n${header}:`));
      console.log(chalk.dim('─'.repeat(60)));

      for (const skill of skills) {
        const version = skill.version ? chalk.dim(`v${skill.version}`) : '';
        console.log(`  ${chalk.cyan(skill.name.padEnd(25))} ${version}`);

        if (skill.description) {
          console.log(`  ${chalk.dim(skill.description.slice(0, 55))}${skill.description.length > 55 ? '...' : ''}`);
        }
      }
    }
  }

  // List project skills
  if (checkProject) {
    for (const platform of platforms) {
      const skills = await getInstalledSkills(platform, true);

      if (skills.length === 0) {
        continue;
      }

      totalSkills += skills.length;

      const header = options.all
        ? `${getPlatformName(platform)} - Project (${skills.length} skills)`
        : `${getPlatformName(platform)} (${skills.length} skills)`;

      console.log(chalk.bold(`\n${header}:`));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(chalk.dim(`  Path: ${getSkillsPath(platform, true)}`));

      for (const skill of skills) {
        const version = skill.version ? chalk.dim(`v${skill.version}`) : '';
        console.log(`  ${chalk.cyan(skill.name.padEnd(25))} ${version}`);

        if (skill.description) {
          console.log(`  ${chalk.dim(skill.description.slice(0, 55))}${skill.description.length > 55 ? '...' : ''}`);
        }
      }
    }
  }

  if (totalSkills === 0) {
    if (options.project) {
      console.log(chalk.yellow('\nNo skills installed in project.'));
      console.log(chalk.dim('Install a skill with: npx skillhub install <skill-id> --project'));
    } else if (options.all) {
      console.log(chalk.yellow('\nNo skills installed (global or project).'));
    } else {
      console.log(chalk.yellow('\nNo skills installed globally.'));
      console.log(chalk.dim('Use --project to list project-level skills'));
      console.log(chalk.dim('Use --all to list both global and project skills'));
    }
    console.log(chalk.dim('\nSearch for skills with: npx skillhub search <query>'));
    console.log(chalk.dim('Install a skill with: npx skillhub install <skill-id>'));
  } else {
    console.log(chalk.dim(`\n${totalSkills} total skill(s) installed.`));
  }
}

interface InstalledSkill {
  name: string;
  description?: string;
  version?: string;
  path: string;
}

async function getInstalledSkills(platform: Platform, project: boolean = false): Promise<InstalledSkill[]> {
  const skillsPath = getSkillsPath(platform, project);
  const skills: InstalledSkill[] = [];

  if (!(await fs.pathExists(skillsPath))) {
    return skills;
  }

  const entries = await fs.readdir(skillsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsPath, entry.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const metadataPath = path.join(skillPath, '.skillhub.json');

    const hasSkillMd = await fs.pathExists(skillMdPath);
    const hasMetadata = await fs.pathExists(metadataPath);

    if (!hasSkillMd && !hasMetadata) {
      continue;
    }

    try {
      if (hasSkillMd) {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const parsed = parseSkillMd(content);

        skills.push({
          name: parsed.metadata.name || entry.name,
          description: parsed.metadata.description,
          version: parsed.metadata.version,
          path: skillPath,
        });
      } else if (hasMetadata) {
        const metadata = await fs.readJson(metadataPath);
        skills.push({
          name: entry.name,
          description: undefined,
          version: metadata.version || undefined,
          path: skillPath,
        });
      }
    } catch {
      // Skip invalid skills
      skills.push({
        name: entry.name,
        path: skillPath,
      });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
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
