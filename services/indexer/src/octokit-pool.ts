/**
 * Octokit Instance Pool
 * Caches Octokit instances per token to avoid recreation overhead
 */

import { Octokit } from '@octokit/rest';
import { TokenManager } from './token-manager.js';

export class OctokitPool {
  private instances: Map<string, Octokit> = new Map();
  private tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || TokenManager.getInstance();
  }

  getInstance(token?: string): Octokit {
    const actualToken = token || this.tokenManager.getBestToken();

    let instance = this.instances.get(actualToken);
    if (!instance) {
      instance = new Octokit({
        auth: actualToken,
        userAgent: 'SkillHub-Indexer/1.0',
      });
      this.instances.set(actualToken, instance);
    }

    return instance;
  }

  async getBestInstance(): Promise<Octokit> {
    const token = await this.tokenManager.checkAndRotate();
    return this.getInstance(token);
  }

  updateStats(token: string, headers: Record<string, unknown>): void {
    this.tokenManager.updateTokenStats(token, headers);
  }

  getTokenManager(): TokenManager {
    return this.tokenManager;
  }
}
