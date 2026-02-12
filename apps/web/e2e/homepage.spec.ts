import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SkillHub/);
  });

  test('should display stats section', async ({ page }) => {
    await page.goto('/');
    // Stats section should be visible
    const statsSection = page.locator('text=/skills|downloads|categories/i').first();
    await expect(statsSection).toBeVisible();
  });

  test('should display featured skills section', async ({ page }) => {
    await page.goto('/');
    // Featured or Popular section
    const featuredSection = page.locator('text=/featured|popular|trending/i').first();
    await expect(featuredSection).toBeVisible();
  });

  test('should have navigation header', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();
  });

  test('should have working browse link', async ({ page }) => {
    await page.goto('/');
    const browseLink = page.getByRole('link', { name: /browse|skills/i }).first();
    await browseLink.click();
    await expect(page).toHaveURL(/browse/);
  });

  test('should have working categories link', async ({ page }) => {
    await page.goto('/');
    const categoriesLink = page.getByRole('link', { name: /categories/i }).first();
    await categoriesLink.click();
    await expect(page).toHaveURL(/categories/);
  });
});
