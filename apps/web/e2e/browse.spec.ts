import { test, expect } from '@playwright/test';

test.describe('Browse Skills Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/browse');
  });

  test('should display skills list', async ({ page }) => {
    // Wait for skills to load or empty state to show
    const skillCard = page.locator('[data-testid="skill-card"], .skill-card, article, a[href*="/skill/"]').first();
    const emptyState = page.locator('text=/no skills|no results|empty/i').first();

    // Either skills should be visible OR empty state should be shown
    const hasContent = await Promise.race([
      skillCard.isVisible().then(v => v ? 'skills' : null).catch(() => null),
      emptyState.isVisible().then(v => v ? 'empty' : null).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))
    ]);

    // Page should load successfully and show some content
    expect(['skills', 'empty']).toContain(hasContent);
  });

  test('should have search functionality', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();
  });

  test('should filter skills by search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('test');
    await searchInput.press('Enter');
    // URL should include search query
    await expect(page).toHaveURL(/q=test|search=test/);
  });

  test('should have platform filter', async ({ page }) => {
    const platformFilter = page.locator('text=/claude|copilot|codex|platform/i').first();
    await expect(platformFilter).toBeVisible();
  });

  test('should display skill cards with required info', async ({ page }) => {
    // Each skill card should have name/title
    const skillName = page.locator('h2, h3, [data-testid="skill-name"]').first();
    await expect(skillName).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to skill detail on click', async ({ page }) => {
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click();
    await expect(page).toHaveURL(/\/skill\//);
  });
});
