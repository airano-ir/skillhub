import { test, expect } from '@playwright/test';

test.describe('API Health Checks', () => {
  test('health endpoint should return OK', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Health endpoint returns 'healthy', 'degraded', or 'unhealthy'
    expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
  });

  test('stats endpoint should return stats', async ({ request }) => {
    const response = await request.get('/api/stats');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('totalSkills');
    expect(data).toHaveProperty('totalDownloads');
    expect(data).toHaveProperty('totalCategories');
  });

  test('categories endpoint should return categories', async ({ request }) => {
    const response = await request.get('/api/categories');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // API returns { categories: [...] }
    expect(data).toHaveProperty('categories');
    expect(Array.isArray(data.categories)).toBe(true);
  });

  test('skills endpoint should return skills list', async ({ request }) => {
    const response = await request.get('/api/skills');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('skills');
    expect(data).toHaveProperty('pagination');
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test('skills endpoint should support search query', async ({ request }) => {
    const response = await request.get('/api/skills?q=test');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('skills');
  });

  test('skills endpoint should support pagination', async ({ request }) => {
    const response = await request.get('/api/skills?page=1&limit=5');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(5);
  });

  test('featured skills endpoint should return featured skills', async ({ request }) => {
    const response = await request.get('/api/skills/featured');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // API returns { skills: [...] }
    expect(data).toHaveProperty('skills');
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test('recent skills endpoint should return recent skills', async ({ request }) => {
    const response = await request.get('/api/skills/recent');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // API returns { skills: [...] }
    expect(data).toHaveProperty('skills');
    expect(Array.isArray(data.skills)).toBe(true);
  });
});
