/**
 * GitHub Token Manager for Web App
 *
 * Manages multiple GitHub tokens for rate limit rotation in Next.js API routes.
 * Uses Redis for shared state across serverless function instances.
 *
 * Configuration:
 *   GITHUB_TOKEN=token1                    # Single token (backward compatible)
 *   GITHUB_TOKENS=token1,token2,token3     # Multiple tokens for rotation
 *   GITHUB_TOKEN_NAMES=primary,backup1     # Optional custom names
 */

import { getRedis } from './cache';

const REDIS_KEY = 'github:tokens';
const REDIS_TTL = 3600; // 1 hour

export interface TokenInfo {
  token: string;
  name: string;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  limit: number;
  lastUsed: number;
  isExhausted: boolean;
}

interface TokenState {
  tokens: TokenInfo[];
  lastUpdated: number;
}

/**
 * Parse GitHub tokens from environment variables
 */
function parseTokensFromEnv(): { token: string; name: string }[] {
  // Try multi-token format first
  const tokensEnv = process.env.GITHUB_TOKENS;
  const namesEnv = process.env.GITHUB_TOKEN_NAMES;

  if (tokensEnv) {
    const tokens = tokensEnv.split(',').map((t) => t.trim()).filter(Boolean);
    const names = namesEnv ? namesEnv.split(',').map((n) => n.trim()) : [];

    return tokens.map((token, i) => ({
      token,
      name: names[i] || `token-${i + 1}`,
    }));
  }

  // Fallback to single token (backward compatible)
  const singleToken = process.env.GITHUB_TOKEN;
  if (singleToken) {
    return [{ token: singleToken, name: 'primary' }];
  }

  return [];
}

/**
 * Get token state from Redis or initialize
 */
async function getTokenState(): Promise<TokenState | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached) {
      return JSON.parse(cached) as TokenState;
    }
  } catch (error) {
    console.warn('Failed to get token state from Redis:', error);
  }

  return null;
}

/**
 * Save token state to Redis
 */
async function saveTokenState(state: TokenState): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(REDIS_KEY, JSON.stringify(state), 'EX', REDIS_TTL);
  } catch (error) {
    console.warn('Failed to save token state to Redis:', error);
  }
}

/**
 * Initialize tokens with default values
 */
function initializeTokens(): TokenInfo[] {
  const parsed = parseTokensFromEnv();

  return parsed.map(({ token, name }) => ({
    token,
    name,
    remaining: 5000, // Default authenticated limit
    reset: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    limit: 5000,
    lastUsed: 0,
    isExhausted: false,
  }));
}

/**
 * Get the best available token
 */
export async function getBestToken(): Promise<string | null> {
  const envTokens = parseTokensFromEnv();
  if (envTokens.length === 0) {
    return null;
  }

  // If only one token, just return it
  if (envTokens.length === 1) {
    return envTokens[0].token;
  }

  // Try to get state from Redis
  let state = await getTokenState();

  if (!state) {
    // Initialize with default values
    state = {
      tokens: initializeTokens(),
      lastUpdated: Date.now(),
    };
    await saveTokenState(state);
  }

  // Find token with highest remaining requests
  const available = state.tokens
    .filter((t) => !t.isExhausted)
    .sort((a, b) => b.remaining - a.remaining);

  if (available.length > 0) {
    return available[0].token;
  }

  // All exhausted - check if any reset time has passed
  const now = Math.floor(Date.now() / 1000);
  const resetTokens = state.tokens.filter((t) => t.reset <= now);

  if (resetTokens.length > 0) {
    // Reset the exhausted flag for tokens that have reset
    for (const t of resetTokens) {
      t.isExhausted = false;
      t.remaining = t.limit;
    }
    await saveTokenState(state);
    return resetTokens[0].token;
  }

  // Return token with earliest reset time
  const earliest = state.tokens.sort((a, b) => a.reset - b.reset)[0];
  return earliest.token;
}

/**
 * Update token stats after a GitHub API call
 */
export async function updateTokenStats(
  token: string,
  headers: Headers
): Promise<void> {
  const envTokens = parseTokensFromEnv();
  if (envTokens.length <= 1) return; // Skip for single token

  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const limit = headers.get('x-ratelimit-limit');

  if (!remaining) return;

  let state = await getTokenState();
  if (!state) {
    state = {
      tokens: initializeTokens(),
      lastUpdated: Date.now(),
    };
  }

  const tokenInfo = state.tokens.find((t) => t.token === token);
  if (!tokenInfo) return;

  tokenInfo.remaining = parseInt(remaining, 10);
  tokenInfo.isExhausted = tokenInfo.remaining < 10;
  tokenInfo.lastUsed = Date.now();

  if (reset) {
    tokenInfo.reset = parseInt(reset, 10);
  }
  if (limit) {
    tokenInfo.limit = parseInt(limit, 10);
  }

  state.lastUpdated = Date.now();
  await saveTokenState(state);

  // Log when running low (suppress eslint warning for monitoring)
  if (tokenInfo.remaining % 500 === 0 || tokenInfo.isExhausted) {
    // eslint-disable-next-line no-console
    console.log(
      `[GitHub Token: ${tokenInfo.name}] ${tokenInfo.remaining}/${tokenInfo.limit} requests remaining`
    );
  }
}

/**
 * Get token status for debugging/monitoring
 */
export async function getTokenStatus(): Promise<{
  total: number;
  available: number;
  tokens: Array<{
    name: string;
    remaining: number;
    limit: number;
    isExhausted: boolean;
    resetAt: string;
  }>;
} | null> {
  const envTokens = parseTokensFromEnv();
  if (envTokens.length === 0) {
    return null;
  }

  const state = await getTokenState();
  if (!state) {
    return {
      total: envTokens.length,
      available: envTokens.length,
      tokens: envTokens.map(({ name }) => ({
        name,
        remaining: 5000,
        limit: 5000,
        isExhausted: false,
        resetAt: new Date(Date.now() + 3600000).toISOString(),
      })),
    };
  }

  return {
    total: state.tokens.length,
    available: state.tokens.filter((t) => !t.isExhausted).length,
    tokens: state.tokens.map((t) => ({
      name: t.name,
      remaining: t.remaining,
      limit: t.limit,
      isExhausted: t.isExhausted,
      resetAt: new Date(t.reset * 1000).toISOString(),
    })),
  };
}

/**
 * Create headers for GitHub API request with best available token
 */
export async function getGitHubHeaders(): Promise<{
  headers: Record<string, string>;
  token: string | null;
}> {
  const token = await getBestToken();

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SkillHub-Web/1.0',
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  return { headers, token };
}
