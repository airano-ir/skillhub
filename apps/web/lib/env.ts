/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

// Required environment variables (app will fail without these)
const REQUIRED_ENV_VARS = ['DATABASE_URL'];

// Recommended environment variables (app works but with reduced functionality)
const RECOMMENDED_ENV_VARS = ['GITHUB_TOKEN', 'AUTH_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];

// Optional environment variables (nice to have)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OPTIONAL_ENV_VARS = ['MEILI_URL', 'MEILI_MASTER_KEY', 'REDIS_URL'];

/**
 * Validate environment variables
 * Call this at application startup to fail fast if critical env vars are missing
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check recommended variables (warn but don't fail)
  for (const envVar of RECOMMENDED_ENV_VARS) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} not set - some features may not work`);
    }
  }

  // Specific warnings for missing optional features
  if (!process.env.GITHUB_TOKEN) {
    warnings.push('GITHUB_TOKEN not set - limited to 60 GitHub API requests/hour');
  }

  if (!process.env.MEILI_URL) {
    warnings.push('MEILI_URL not set - using PostgreSQL for search (slower)');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate and throw if critical env vars are missing
 * Use this in server components/API routes for fail-fast behavior
 */
export function requireEnv(): void {
  const result = validateEnv();

  if (!result.valid) {
    throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`);
  }

  // Log warnings in development
  if (process.env.NODE_ENV === 'development' && result.warnings.length > 0) {
    console.warn('Environment warnings:');
    result.warnings.forEach((w) => console.warn(`  - ${w}`));
  }
}

/**
 * Get a required environment variable or throw
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}
