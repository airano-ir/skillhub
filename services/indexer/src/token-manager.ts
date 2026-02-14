/**
 * GitHub Token Manager
 * Manages multiple GitHub tokens for rate limit rotation
 */

import { Octokit } from '@octokit/rest';

export interface TokenInfo {
  token: string;
  name: string;
  remaining: number;
  reset: number; // Unix timestamp in milliseconds
  limit: number;
  lastUsed: number;
  isExhausted: boolean;
}

export interface RateLimitStatus {
  totalTokens: number;
  availableTokens: number;
  globalRemaining: number;
  nextReset: number;
  tokens: TokenInfo[];
}

export class TokenManager {
  private static instance: TokenManager | null = null;
  private tokens: TokenInfo[] = [];
  private octokit: Map<string, Octokit> = new Map();

  constructor(tokens?: string[], names?: string[]) {
    if (!tokens || tokens.length === 0) {
      tokens = this.parseTokensFromEnv();
    }

    const tokenNames = names || this.generateTokenNames(tokens.length);

    this.tokens = tokens.map((token, i) => ({
      token,
      name: tokenNames[i],
      remaining: 5000, // Default GitHub authenticated limit
      reset: Date.now() + 3600000, // 1 hour from now
      limit: 5000,
      lastUsed: 0,
      isExhausted: false,
    }));

    console.log(`TokenManager initialized with ${this.tokens.length} token(s)`);

    // Refresh all tokens from GitHub API to get accurate rate limits
    this.refreshAllTokens().catch((error) => {
      console.warn('Failed to refresh tokens on init:', error);
    });
  }

  async refreshAllTokens(): Promise<void> {
    for (const tokenInfo of this.tokens) {
      await this.refreshRateLimit(tokenInfo.token);
    }
  }

  static getInstance(): TokenManager {
    if (!this.instance) {
      this.instance = new TokenManager();
    }
    return this.instance;
  }

  private parseTokensFromEnv(): string[] {
    // Try multi-token format first
    const tokensEnv = process.env.GITHUB_TOKENS;
    if (tokensEnv) {
      const tokens = tokensEnv.split(',').map((t) => t.trim()).filter(Boolean);
      if (tokens.length > 0) {
        return tokens;
      }
    }

    // Fallback to single token (backward compatible)
    const singleToken = process.env.GITHUB_TOKEN;
    if (singleToken) {
      return [singleToken];
    }

    throw new Error(
      'No GitHub tokens configured. Set GITHUB_TOKEN or GITHUB_TOKENS environment variable'
    );
  }

  private generateTokenNames(count: number): string[] {
    const namesEnv = process.env.GITHUB_TOKEN_NAMES;
    if (namesEnv) {
      const names = namesEnv.split(',').map((n) => n.trim());
      if (names.length === count) {
        return names;
      }
    }
    // Auto-generate names
    return Array.from({ length: count }, (_, i) => `token-${i + 1}`);
  }

  getBestToken(): string {
    // Find token with highest remaining requests
    const available = this.tokens
      .filter((t) => !t.isExhausted)
      .sort((a, b) => b.remaining - a.remaining);

    if (available.length > 0) {
      const best = available[0];
      best.lastUsed = Date.now();
      return best.token;
    }

    // All exhausted - return token with earliest reset
    const earliest = this.tokens.sort((a, b) => a.reset - b.reset)[0];
    return earliest.token;
  }

  updateTokenStats(token: string, headers: Record<string, unknown>): void {
    const tokenInfo = this.tokens.find((t) => t.token === token);
    if (!tokenInfo) return;

    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const limit = headers['x-ratelimit-limit'];

    // GitHub Code Search API returns its own rate limit headers (limit=10 or 30)
    // which differ from the REST API limit (5000). Only update token stats
    // from REST API responses to avoid corrupting the primary rate limit tracking.
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : 0;
    if (parsedLimit > 0 && parsedLimit < 100) {
      // Secondary rate limit (code search, etc.) - skip updating primary stats
      return;
    }

    if (typeof remaining === 'string') {
      tokenInfo.remaining = parseInt(remaining, 10);
      tokenInfo.isExhausted = tokenInfo.remaining < 2;
    }
    if (typeof reset === 'string') {
      tokenInfo.reset = parseInt(reset, 10) * 1000;
    }
    if (parsedLimit > 0) {
      tokenInfo.limit = parsedLimit;
    }

    if (tokenInfo.remaining % 100 === 0 || tokenInfo.isExhausted) {
      console.log(`[${tokenInfo.name}] ${tokenInfo.remaining}/${tokenInfo.limit} requests remaining`);
    }
  }

  async checkAndRotate(): Promise<string> {
    const current = this.getBestToken();
    const currentInfo = this.tokens.find((t) => t.token === current);

    if (!currentInfo) return current;

    // If current token is exhausted, try to rotate
    if (currentInfo.isExhausted) {
      console.log(`[${currentInfo.name}] Exhausted, checking other tokens...`);

      // Check if any other tokens are available
      const available = this.tokens.find((t) => !t.isExhausted && t.token !== current);

      if (available) {
        this.logRotation(currentInfo.name, available.name, 'Token exhausted');
        return available.token;
      }

      // All tokens exhausted - wait for earliest reset
      const waitTime = Math.max(0, currentInfo.reset - Date.now()) + 1000;
      console.warn(
        `All tokens exhausted. Waiting ${Math.ceil(waitTime / 1000)}s until [${currentInfo.name}] resets...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Refresh ALL tokens after waiting (others may have reset too)
      await this.refreshAllTokens();
    }

    return current;
  }

  async refreshRateLimit(token: string): Promise<void> {
    const tokenInfo = this.tokens.find((t) => t.token === token);
    if (!tokenInfo) return;

    try {
      let octokit = this.octokit.get(token);
      if (!octokit) {
        octokit = new Octokit({
          auth: token,
          userAgent: 'SkillHub-Indexer/1.0',
        });
        this.octokit.set(token, octokit);
      }

      const response = await octokit.rateLimit.get();
      const core = response.data.resources.core;

      tokenInfo.remaining = core.remaining;
      tokenInfo.reset = core.reset * 1000;
      tokenInfo.limit = core.limit;
      tokenInfo.isExhausted = core.remaining < 2;

      console.log(
        `[${tokenInfo.name}] Refreshed: ${core.remaining}/${core.limit} (resets at ${new Date(tokenInfo.reset).toLocaleTimeString()})`
      );
    } catch (error) {
      console.error(`Failed to refresh rate limit for [${tokenInfo.name}]:`, error);
    }
  }

  getStatus(): RateLimitStatus {
    const availableTokens = this.tokens.filter((t) => !t.isExhausted);
    const globalRemaining = this.tokens.reduce((sum, t) => sum + t.remaining, 0);
    const nextReset = Math.min(...this.tokens.map((t) => t.reset));

    return {
      totalTokens: this.tokens.length,
      availableTokens: availableTokens.length,
      globalRemaining,
      nextReset,
      tokens: [...this.tokens],
    };
  }

  private logRotation(from: string, to: string, reason: string): void {
    console.log(`
═══════════════════════════════════════
TOKEN ROTATION
From: [${from}]
To: [${to}]
Reason: ${reason}
Time: ${new Date().toISOString()}
═══════════════════════════════════════
    `);
  }
}
