import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';

// Mock the database module
vi.mock('@skillhub/db', () => ({
  createDb: () => ({
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  isMeilisearchHealthy: vi.fn().mockResolvedValue(true),
}));

describe('GET /api/health', () => {
  it('should return status 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('should return health status', async () => {
    const response = await GET();
    const data = await response.json();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
  });

  it('should return current timestamp', async () => {
    const before = new Date().toISOString();
    const response = await GET();
    const data = await response.json();
    const after = new Date().toISOString();

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(new Date(data.timestamp).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
  });

  it('should return version', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.version).toBe('0.1.0');
  });

  it('should return services status', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.services).toBeDefined();
    expect(data.services.database).toBeDefined();
    expect(data.services.meilisearch).toBeDefined();
  });
});
