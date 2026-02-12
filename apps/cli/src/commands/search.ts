import chalk from 'chalk';
import ora from 'ora';
import { searchSkills } from '../utils/api.js';

interface SearchOptions {
  platform?: string;
  sort?: string;
  limit?: string;
  page?: string;
}

/**
 * Search for skills in the registry
 */
export async function search(query: string, options: SearchOptions): Promise<void> {
  const spinner = ora('Searching skills...').start();

  try {
    const limit = parseInt(options.limit || '10');
    const page = parseInt(options.page || '1');
    const sort = options.sort || 'downloads';
    const result = await searchSkills(query, {
      platform: options.platform,
      limit,
      page,
      sort,
    });

    spinner.stop();

    if (result.skills.length === 0) {
      console.log(chalk.yellow('No skills found.'));
      console.log(chalk.dim('Try a different search term or check the spelling.'));
      return;
    }

    const sortLabel = { downloads: 'downloads', stars: 'GitHub stars', rating: 'rating', recent: 'recently updated' }[sort] || sort;
    console.log(chalk.bold(`Found ${result.pagination.total} skills (sorted by ${sortLabel}):\n`));

    // Print results as a table
    console.log(
      chalk.dim('─'.repeat(80))
    );

    const startIndex = (page - 1) * limit;
    for (let i = 0; i < result.skills.length; i++) {
      const skill = result.skills[i];
      const num = chalk.dim(`[${startIndex + i + 1}]`);
      const verified = skill.isVerified ? chalk.green('✓') : ' ';
      // Use securityStatus if available, otherwise fall back to score-based badge
      const security = skill.securityStatus
        ? getSecurityStatusBadge(skill.securityStatus)
        : getSecurityBadge(skill.securityScore);

      // First line: number, ID, security
      console.log(
        `${num} ${verified} ${chalk.cyan(skill.id.padEnd(38))} ${security}`
      );

      // Second line: downloads, stars, description
      console.log(
        `     ⬇ ${formatNumber(skill.downloadCount).padStart(6)}  ⭐ ${formatNumber(skill.githubStars).padStart(6)}  ${chalk.dim(skill.description.slice(0, 55))}${skill.description.length > 55 ? '...' : ''}`
      );

      // Third line: Rating (only if ratingCount >= 3)
      const showRating = (skill.ratingCount ?? 0) >= 3;
      if (showRating && skill.rating) {
        console.log(
          `     ${chalk.yellow('★')} ${skill.rating.toFixed(1)} ${chalk.dim(`(${skill.ratingCount} ratings)`)}`
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
    }

    console.log();
    console.log(chalk.dim(`Install with: ${chalk.white('npx skillhub install <skill-id>')}`));

    const totalPages = result.pagination.totalPages;
    if (totalPages > 1) {
      console.log(
        chalk.dim(`Page ${page} of ${totalPages}. Use ${chalk.white(`--page ${page + 1}`)} for next page.`)
      );
    }

    if (sort === 'downloads') {
      console.log(chalk.dim(`Sort options: ${chalk.white('--sort stars|rating|recent')}`));
    }
  } catch (error) {
    spinner.fail('Search failed');
    const err = error as Error;
    console.error(chalk.red(err.message || 'Unknown error'));
    if (process.env.DEBUG) {
      console.error(chalk.dim('Stack:'), err.stack);
    }
    process.exit(1);
  }
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

/**
 * Get security badge from securityStatus (new system)
 */
function getSecurityStatusBadge(status: string): string {
  switch (status) {
    case 'pass':
      return chalk.green('🛡️ Pass');
    case 'warning':
      return chalk.yellow('⚠️  Warn');
    case 'fail':
      return chalk.red('❌ Fail');
    default:
      return chalk.dim('- N/A');
  }
}

/**
 * Get security badge from securityScore (legacy system)
 */
function getSecurityBadge(score: number): string {
  if (score >= 90) return chalk.green('●●●●●');
  if (score >= 70) return chalk.yellow('●●●●○');
  if (score >= 50) return chalk.yellow('●●●○○');
  if (score >= 30) return chalk.red('●●○○○');
  return chalk.red('●○○○○');
}
