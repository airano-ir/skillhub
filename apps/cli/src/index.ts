#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { install } from './commands/install.js';
import { search } from './commands/search.js';
import { list } from './commands/list.js';
import { config } from './commands/config.js';
import { loadConfig, type Platform } from './utils/paths.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

const program = new Command();

program
  .name('skillhub')
  .description('CLI for managing AI Agent skills')
  .version(VERSION);

// Install command
program
  .command('install <skill-id>')
  .description('Install a skill from the registry')
  .option('-p, --platform <platform>', 'Target platform (claude, codex, copilot, cursor, windsurf)')
  .option('--project', 'Install in the current project instead of globally')
  .option('-f, --force', 'Overwrite existing skill')
  .option('--no-api', 'Skip API lookup and fetch directly from GitHub')
  .action(async (skillId: string, options) => {
    // Load config to get default platform
    const userConfig = await loadConfig();
    const platform = options.platform || (userConfig.defaultPlatform as Platform) || 'claude';

    await install(skillId, {
      platform,
      project: options.project,
      force: options.force,
      noApi: !options.api, // Commander converts --no-api to api: false
    });
  });

// Search command
program
  .command('search <query>')
  .description('Search for skills in the registry')
  .option('-p, --platform <platform>', 'Filter by platform')
  .option('-s, --sort <sort>', 'Sort by: downloads, stars, rating, recent', 'downloads')
  .option('-l, --limit <number>', 'Number of results', '10')
  .option('--page <number>', 'Page number', '1')
  .action(async (query: string, options) => {
    await search(query, options);
  });

// List command
program
  .command('list')
  .description('List installed skills')
  .option('-p, --platform <platform>', 'Filter by platform')
  .option('--project', 'List skills in the current project')
  .option('--all', 'List both global and project skills')
  .action(async (options) => {
    await list(options);
  });

// Config command
program
  .command('config')
  .description('Manage CLI configuration')
  .option('--set <key=value>', 'Set a configuration value')
  .option('--get <key>', 'Get a configuration value')
  .option('--list', 'List all configuration values')
  .action(async (options) => {
    await config(options);
  });

// Uninstall command
program
  .command('uninstall <skill-name>')
  .description('Uninstall a skill')
  .option('-p, --platform <platform>', 'Target platform')
  .option('--project', 'Uninstall from project instead of globally')
  .action(async (skillName: string, options) => {
    const fs = await import('fs-extra');
    const pathModule = await import('path');
    const { getSkillPath, isSkillInstalled } = await import('./utils/paths.js');

    // Load config to get default platform
    const userConfig = await loadConfig();
    const platform = options.platform || (userConfig.defaultPlatform as Platform) || 'claude';

    const installed = await isSkillInstalled(platform, skillName, options.project);
    if (!installed) {
      console.log(chalk.yellow(`Skill ${skillName} is not installed.`));
      process.exit(1);
    }

    const skillPath = getSkillPath(platform, skillName, options.project);

    // Clean up flat platform file if present
    const metadataPath = pathModule.join(skillPath, '.skillhub.json');
    if (await fs.default.pathExists(metadataPath)) {
      try {
        const metadata = await fs.default.readJson(metadataPath);
        if (metadata.platformFilePath) {
          await fs.default.remove(metadata.platformFilePath);
        }
      } catch {
        // Ignore metadata read errors
      }
    }

    await fs.default.remove(skillPath);
    console.log(chalk.green(`Skill ${skillName} uninstalled successfully.`));
  });

// Update command
program
  .command('update [skill-name]')
  .description('Update installed skills')
  .option('-p, --platform <platform>', 'Target platform')
  .option('--all', 'Update all installed skills')
  .action(async (skillName: string | undefined, options) => {
    const fsExtra = await import('fs-extra');
    const pathModule = await import('path');
    const { getSkillsPath, getSkillPath } = await import('./utils/paths.js');

    // Load config to get default platform
    const userConfig = await loadConfig();
    const platform = options.platform || (userConfig.defaultPlatform as Platform) || 'claude';

    const ALL_PLATFORMS: Platform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];

    if (options.all) {
      console.log(chalk.cyan('\nUpdating all installed skills...\n'));

      const platforms = options.platform ? [platform] : ALL_PLATFORMS;
      let updated = 0;
      let failed = 0;
      let skipped = 0;

      for (const p of platforms) {
        const skillsPath = getSkillsPath(p);

        if (!(await fsExtra.default.pathExists(skillsPath))) {
          continue;
        }

        const entries = await fsExtra.default.readdir(skillsPath, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const skillPath = pathModule.join(skillsPath, entry.name);
          const metadataPath = pathModule.join(skillPath, '.skillhub.json');

          // Check if skill has metadata with skillId
          if (!(await fsExtra.default.pathExists(metadataPath))) {
            console.log(chalk.yellow(`  Skipping ${entry.name}: No metadata (reinstall with CLI to enable updates)`));
            skipped++;
            continue;
          }

          try {
            const metadata = await fsExtra.default.readJson(metadataPath);
            const skillId = metadata.skillId;

            if (!skillId) {
              console.log(chalk.yellow(`  Skipping ${entry.name}: No skill ID in metadata`));
              skipped++;
              continue;
            }

            console.log(chalk.dim(`  Updating ${entry.name}...`));

            // Re-install with force
            await install(skillId, {
              platform: p,
              force: true,
            });

            updated++;
          } catch (error) {
            console.log(chalk.red(`  Failed to update ${entry.name}: ${(error as Error).message}`));
            failed++;
          }
        }
      }

      console.log();
      console.log(chalk.green(`Updated: ${updated}`));
      if (failed > 0) console.log(chalk.red(`Failed: ${failed}`));
      if (skipped > 0) console.log(chalk.yellow(`Skipped: ${skipped}`));
      return;
    }

    if (!skillName) {
      console.log(chalk.red('Please specify a skill name or use --all.'));
      process.exit(1);
    }

    // Update single skill by name
    const skillPath = getSkillPath(platform, skillName);
    const metadataPath = pathModule.join(skillPath, '.skillhub.json');

    if (!(await fsExtra.default.pathExists(metadataPath))) {
      console.log(chalk.yellow(`Skill ${skillName} was not installed via CLI.`));
      console.log(chalk.dim('To update, reinstall with: npx skillhub install <skill-id> --force'));
      process.exit(1);
    }

    try {
      const metadata = await fsExtra.default.readJson(metadataPath);
      const skillId = metadata.skillId;

      if (!skillId) {
        console.log(chalk.red('No skill ID found in metadata.'));
        process.exit(1);
      }

      console.log(chalk.dim(`Updating ${skillName}...`));
      await install(skillId, {
        platform,
        force: true,
      });
    } catch (error) {
      console.log(chalk.red(`Failed to update: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.help();
}
