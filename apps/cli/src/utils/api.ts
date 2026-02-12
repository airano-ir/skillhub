import https from 'https';
import http from 'http';

const API_BASE_URL = process.env.SKILLHUB_API_URL || 'https://skills.palebluedot.live/api';
const API_TIMEOUT = parseInt(process.env.SKILLHUB_API_TIMEOUT || '20000'); // 20 seconds default
const API_FILES_TIMEOUT = parseInt(process.env.SKILLHUB_API_FILES_TIMEOUT || '45000'); // 45 seconds for file fetching (server may need to fetch from GitHub on cache miss)

interface HttpResponse {
  statusCode: number;
  data: string;
}

/**
 * Make an HTTPS request using native Node.js module
 * Handles Cloudflare chunked encoding issues by detecting complete JSON responses
 */
function httpsRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const requestTimeout = options.timeout || API_TIMEOUT;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'skillhub-cli',
        'Accept': 'application/json',
        ...options.headers,
      },
      timeout: requestTimeout,
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let resolved = false;

      const tryResolve = () => {
        if (resolved) return;
        const data = Buffer.concat(chunks).toString();

        // For JSON responses, detect complete objects
        // This works around Cloudflare chunked encoding issues
        if (data.startsWith('{') || data.startsWith('[')) {
          try {
            JSON.parse(data); // Validate complete JSON
            resolved = true;
            res.destroy(); // Force close connection
            resolve({
              statusCode: res.statusCode || 0,
              data,
            });
          } catch {
            // JSON not complete yet, continue waiting
          }
        }
      };

      res.on('data', (chunk) => {
        chunks.push(chunk);
        tryResolve();
      });

      res.on('end', () => {
        if (!resolved) {
          resolve({
            statusCode: res.statusCode || 0,
            data: Buffer.concat(chunks).toString(),
          });
        }
      });

      // Set a per-request timeout for receiving data
      res.setTimeout(requestTimeout, () => {
        if (!resolved) {
          res.destroy();
          reject(new Error(`Response timeout after ${requestTimeout / 1000}s`));
        }
      });
    });

    req.on('error', (err) => {
      // Ignore stream destroyed errors (we caused them intentionally)
      if ((err as NodeJS.ErrnoException).code === 'ERR_STREAM_DESTROYED') return;
      reject(new Error(`Network error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${requestTimeout / 1000}s`));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  githubOwner: string;
  githubRepo: string;
  skillPath: string;
  branch: string;
  version?: string;
  license?: string;
  githubStars: number;
  downloadCount: number;
  securityScore: number;
  securityStatus?: 'pass' | 'warning' | 'fail' | null;
  sourceFormat?: string;
  rating?: number | null;
  ratingCount?: number | null;
  isVerified: boolean;
  compatibility: {
    platforms: string[];
  };
}

export interface SearchResult {
  skills: SkillInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search for skills
 */
export async function searchSkills(
  query: string,
  options: {
    platform?: string;
    limit?: number;
    page?: number;
    sort?: string;
  } = {}
): Promise<SearchResult> {
  const params = new URLSearchParams({
    q: query,
    limit: String(options.limit || 10),
    page: String(options.page || 1),
    sort: options.sort || 'downloads',
  });

  if (options.platform) {
    params.set('platform', options.platform);
  }

  const response = await httpsRequest(`${API_BASE_URL}/skills?${params}`);

  if (response.statusCode !== 200) {
    throw new Error(`API error ${response.statusCode}: ${response.data || 'Unknown error'}`);
  }

  return JSON.parse(response.data);
}

/**
 * Get skill details
 */
export async function getSkill(id: string): Promise<SkillInfo | null> {
  // Encode each segment separately to preserve slashes in URL path
  const encodedPath = id.split('/').map(encodeURIComponent).join('/');
  const response = await httpsRequest(`${API_BASE_URL}/skills/${encodedPath}`);

  if (response.statusCode === 404) {
    return null;
  }

  if (response.statusCode !== 200) {
    throw new Error(`API error ${response.statusCode}: ${response.data || 'Unknown error'}`);
  }

  return JSON.parse(response.data);
}

/**
 * Track an installation
 */
export async function trackInstall(
  skillId: string,
  platform: string,
  method = 'cli'
): Promise<void> {
  try {
    await httpsRequest(`${API_BASE_URL}/skills/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId, platform, method }),
    });
  } catch {
    // Silently fail - tracking is not critical
  }
}

export interface SkillFile {
  name: string;
  path: string;
  type: 'file';
  size: number;
  content?: string; // Text file content
  downloadUrl?: string; // For binary files
}

export interface SkillFilesResponse {
  skillId: string;
  githubOwner: string;
  githubRepo: string;
  skillPath: string;
  branch: string;
  sourceFormat?: string;
  files: SkillFile[];
  fromCache: boolean;
  cachedAt?: string;
}

/**
 * Get skill files from API (uses server-side cache)
 * Returns null if API unavailable or skill not found
 */
export async function getSkillFiles(id: string): Promise<SkillFilesResponse | null> {
  try {
    const response = await httpsRequest(
      `${API_BASE_URL}/skill-files?id=${encodeURIComponent(id)}`,
      { timeout: API_FILES_TIMEOUT }
    );

    if (response.statusCode === 404) {
      return null;
    }

    if (response.statusCode !== 200) {
      return null;
    }

    return JSON.parse(response.data);
  } catch {
    // API unavailable, return null to fall back to GitHub
    return null;
  }
}
