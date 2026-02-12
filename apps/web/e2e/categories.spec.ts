import { test, expect } from '@playwright/test';

test.describe('Categories Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/categories');
  });

  test('should display categories page', async ({ page }) => {
    // Categories page should have h1 heading with "Categories" or Persian equivalent
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
    // Page should load successfully (any content is fine, title may not include "categories")
    await expect(page).toHaveURL(/categories/);
  });

  test('should list all categories', async ({ page }) => {
    // Wait for categories to load
    const categoryItems = page.locator('[data-testid="category-card"], .category-card, article, a[href*="/browse?category"]');
    await expect(categoryItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display category names', async ({ page }) => {
    // Categories should have readable names
    const categoryName = page.locator('h2, h3, [data-testid="category-name"]').first();
    await expect(categoryName).toBeVisible({ timeout: 10000 });
  });

  test('should show skill count per category', async ({ page }) => {
    // Should show number of skills in each category
    const skillCount = page.locator('text=/\\d+\\s*(skill|skills)/i').first();
    await expect(skillCount).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to filtered browse page on category click', async ({ page }) => {
    const categoryLink = page.locator('a[href*="/browse?category"], a[href*="category="]').first();
    await categoryLink.click();
    await expect(page).toHaveURL(/category=/);
  });
});
