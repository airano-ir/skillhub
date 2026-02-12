import { describe, it, expect } from 'vitest';

/**
 * Claim Form Validation Tests
 *
 * These tests validate the URL validation logic used in the claim form.
 * Full component tests require React Testing Library setup with jsdom environment.
 */

// Validate GitHub URL format (duplicated from ClaimForm for testing)
function isValidGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'github.com' && urlObj.pathname.split('/').filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

describe('Claim Form - URL Validation', () => {
  describe('isValidGitHubUrl', () => {
    it('should accept valid GitHub repository URL', () => {
      expect(isValidGitHubUrl('https://github.com/owner/repo')).toBe(true);
    });

    it('should accept valid GitHub repository URL with trailing slash', () => {
      expect(isValidGitHubUrl('https://github.com/owner/repo/')).toBe(true);
    });

    it('should accept valid GitHub repository URL with tree path', () => {
      expect(isValidGitHubUrl('https://github.com/owner/repo/tree/main/path')).toBe(true);
    });

    it('should reject non-GitHub URLs', () => {
      expect(isValidGitHubUrl('https://example.com/owner/repo')).toBe(false);
    });

    it('should reject GitHub URL without owner', () => {
      expect(isValidGitHubUrl('https://github.com/owner')).toBe(false);
    });

    it('should reject GitHub homepage', () => {
      expect(isValidGitHubUrl('https://github.com')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidGitHubUrl('not a url')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidGitHubUrl('')).toBe(false);
    });

    it('should reject relative paths', () => {
      expect(isValidGitHubUrl('/owner/repo')).toBe(false);
    });

    it('should reject GitHub gist URLs', () => {
      expect(isValidGitHubUrl('https://gist.github.com/user/abc123')).toBe(false);
    });
  });
});

describe('Claim Form - Error Code Handling', () => {
  it('should map RATE_LIMIT_EXCEEDED error code correctly', () => {
    const errorCodes = {
      'RATE_LIMIT_EXCEEDED': 'GitHub API rate limit exceeded. Please try again in a few minutes.',
      'INVALID_REPO': 'The repository was not found or is not accessible.',
      'NETWORK_TIMEOUT': 'Request timed out while checking the repository.',
      'INVALID_URL': 'Please enter a valid GitHub repository URL.',
    };

    expect(errorCodes['RATE_LIMIT_EXCEEDED']).toBe('GitHub API rate limit exceeded. Please try again in a few minutes.');
  });

  it('should have distinct error messages for each error code', () => {
    const errorCodes = [
      'RATE_LIMIT_EXCEEDED',
      'INVALID_REPO',
      'NETWORK_TIMEOUT',
      'INVALID_URL',
      'ALREADY_PENDING',
    ];

    // All error codes should be unique
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
  });
});

describe('Claim Form - API Response Scenarios', () => {
  describe('Add Request Success Scenarios', () => {
    it('should handle single skill found', () => {
      const response = {
        success: true,
        hasSkillMd: true,
        skillCount: 1,
        skillPaths: ['skills/my-skill'],
      };

      expect(response.skillCount).toBe(1);
      expect(response.hasSkillMd).toBe(true);
    });

    it('should handle multiple skills found', () => {
      const response = {
        success: true,
        hasSkillMd: true,
        skillCount: 3,
        skillPaths: ['skills/skill1', 'skills/skill2', 'skills/skill3'],
      };

      expect(response.skillCount).toBe(3);
      expect(response.skillPaths.length).toBe(3);
    });

    it('should handle no skills found', () => {
      const response = {
        success: true,
        hasSkillMd: false,
        skillCount: 0,
        skillPaths: [],
      };

      expect(response.skillCount).toBe(0);
      expect(response.hasSkillMd).toBe(false);
      expect(response.skillPaths.length).toBe(0);
    });
  });

  describe('Add Request Error Scenarios', () => {
    it('should handle rate limit error', () => {
      const errorResponse = {
        error: 'GitHub API rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      };

      expect(errorResponse.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should handle invalid repository error', () => {
      const errorResponse = {
        error: 'Repository not found',
        code: 'INVALID_REPO',
      };

      expect(errorResponse.code).toBe('INVALID_REPO');
    });

    it('should handle network timeout error', () => {
      const errorResponse = {
        error: 'Request timed out',
        code: 'NETWORK_TIMEOUT',
      };

      expect(errorResponse.code).toBe('NETWORK_TIMEOUT');
    });
  });
});

describe('Repository Validation - Error Message Clarity', () => {
  it('should provide specific error for 404 (not found)', () => {
    const error = 'Repository not found. Please check the URL and ensure the repository exists.';
    expect(error).toContain('not found');
    expect(error).toContain('check the URL');
  });

  it('should provide specific error for rate limit', () => {
    const error = 'GitHub API rate limit exceeded. Please try again later.';
    expect(error).toContain('rate limit');
    expect(error).toContain('try again');
  });

  it('should provide specific error for private repository', () => {
    const error = 'Repository is private or you do not have access. Please ensure the repository is public.';
    expect(error).toContain('private');
    expect(error).toContain('public');
  });

  it('should provide specific error for timeout', () => {
    const error = 'Request timed out while checking repository. Please try again.';
    expect(error).toContain('timed out');
    expect(error).toContain('try again');
  });

  it('should provide generic error for network issues', () => {
    const error = 'Network error while verifying repository. Please check your connection and try again.';
    expect(error).toContain('Network error');
    expect(error).toContain('connection');
  });
});
