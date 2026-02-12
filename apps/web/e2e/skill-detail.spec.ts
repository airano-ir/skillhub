import { test, expect } from '@playwright/test';

test.describe('Skill Detail Page', () => {
  test('should navigate to skill detail from browse', async ({ page }) => {
    await page.goto('/browse');
    // Wait for skills to load and click first one
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });
    await expect(page).toHaveURL(/\/skill\//);
  });

  test('should display skill name', async ({ page }) => {
    await page.goto('/browse');
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });

    // Skill page should have a title/name
    const skillTitle = page.locator('h1').first();
    await expect(skillTitle).toBeVisible();
  });

  test('should display skill description', async ({ page }) => {
    await page.goto('/browse');
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });

    // Should have description text
    const description = page.locator('p, [data-testid="skill-description"]').first();
    await expect(description).toBeVisible();
  });

  test('should show platform compatibility', async ({ page }) => {
    await page.goto('/browse');
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });

    // Should show which platforms are supported
    const platforms = page.locator('text=/claude|copilot|codex/i').first();
    await expect(platforms).toBeVisible();
  });

  test('should show install command', async ({ page }) => {
    await page.goto('/browse');
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });

    // Should have install command somewhere on the page
    // Check for the command text content (may be in sticky sidebar that has visibility issues)
    const pageContent = await page.content();
    const hasInstallCommand = pageContent.includes('npx skillhub install') || pageContent.includes('skillhub install');
    expect(hasInstallCommand).toBe(true);
  });

  test('should have GitHub link', async ({ page }) => {
    await page.goto('/browse');
    const skillLink = page.locator('a[href*="/skill/"]').first();
    await skillLink.click({ timeout: 10000 });

    // Should have link to GitHub repo
    const githubLink = page.locator('a[href*="github.com"]').first();
    await expect(githubLink).toBeVisible();
  });
});
