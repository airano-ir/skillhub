import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from '../utils/paths.js';

interface ConfigOptions {
  set?: string;
  get?: string;
  list?: boolean;
}

/**
 * Manage CLI configuration
 */
export async function config(options: ConfigOptions): Promise<void> {
  const currentConfig = await loadConfig();

  // List all config
  if (options.list || (!options.set && !options.get)) {
    console.log(chalk.bold('SkillHub CLI Configuration:\n'));
    console.log(chalk.dim(`Config file: ${getConfigPath()}\n`));

    if (Object.keys(currentConfig).length === 0) {
      console.log(chalk.yellow('No configuration set.'));
      console.log(chalk.dim('\nAvailable settings:'));
      console.log(chalk.dim('  defaultPlatform  - Default platform for installations (claude, codex, copilot)'));
      console.log(chalk.dim('  apiUrl           - SkillHub API URL'));
      console.log(chalk.dim('  githubToken      - GitHub personal access token for private repos'));
      return;
    }

    for (const [key, value] of Object.entries(currentConfig)) {
      const displayValue = key.toLowerCase().includes('token')
        ? maskSecret(String(value))
        : String(value);
      console.log(`  ${chalk.cyan(key)}: ${displayValue}`);
    }
    return;
  }

  // Get a config value
  if (options.get) {
    const value = currentConfig[options.get];
    if (value === undefined) {
      console.log(chalk.yellow(`Config '${options.get}' is not set.`));
      return;
    }

    const displayValue = options.get.toLowerCase().includes('token')
      ? maskSecret(String(value))
      : String(value);
    console.log(displayValue);
    return;
  }

  // Set a config value
  if (options.set) {
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');

    if (!key || value === undefined) {
      console.error(chalk.red('Invalid format. Use: --set key=value'));
      process.exit(1);
    }

    currentConfig[key] = value;
    await saveConfig(currentConfig);

    const displayValue = key.toLowerCase().includes('token')
      ? maskSecret(value)
      : value;
    console.log(chalk.green(`Set ${chalk.cyan(key)} = ${displayValue}`));
  }
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
}
