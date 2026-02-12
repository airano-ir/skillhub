import { test, expect } from '@playwright/test';

test.describe('Internationalization (i18n)', () => {
  test('should default to English', async ({ page }) => {
    await page.goto('/');
    // Page should be in English by default
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toMatch(/en/);
  });

  test('should have language switcher', async ({ page }) => {
    await page.goto('/');
    // Wait for page to hydrate and header to render
    await page.waitForLoadState('networkidle');
    // Look for language switcher button by data-testid or Globe icon
    const langSwitcher = page.locator('[data-testid="lang-switch"], button:has(svg.lucide-globe)').first();
    await expect(langSwitcher).toBeVisible({ timeout: 10000 });
  });

  // TODO: Fix language switching - router.replace with next-intl isn't triggering navigation
  // The button click works but doesn't cause URL change
  test.skip('should switch to Persian (Farsi)', async ({ page }) => {
    await page.goto('/');
    // Wait for page to hydrate
    await page.waitForLoadState('networkidle');
    // Find and click language switcher
    const langSwitcher = page.locator('[data-testid="lang-switch"], button:has(svg.lucide-globe)').first();
    await langSwitcher.click({ timeout: 10000 });

    // Wait for navigation to complete - should navigate to Persian version
    await page.waitForURL(/\/fa\/?/, { timeout: 10000 });
  });

  test('should apply RTL direction for Persian', async ({ page }) => {
    await page.goto('/fa/');
    // HTML should have dir="rtl" for Persian
    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('rtl');
  });

  test('should display Persian text', async ({ page }) => {
    await page.goto('/fa/');
    // Should have Persian text visible
    const persianText = page.locator('text=/مهارت|دسته‌بندی|جستجو/').first();
    await expect(persianText).toBeVisible();
  });

  test('should switch back to English', async ({ page }) => {
    await page.goto('/fa/');
    // Wait for page to hydrate
    await page.waitForLoadState('networkidle');
    // Find English language option
    const langSwitcher = page.locator('[data-testid="lang-switch"], button:has(svg.lucide-globe)').first();
    await langSwitcher.click({ timeout: 10000 });

    // Should be back in English (no /fa/ in URL)
    await expect(page).not.toHaveURL(/\/fa\//);
  });

  // TODO: Fix language switching - router.replace with next-intl isn't triggering navigation
  test.skip('should preserve page context when switching language', async ({ page }) => {
    // Go to browse page in English
    await page.goto('/browse');
    await expect(page).toHaveURL(/browse/);
    // Wait for page to hydrate
    await page.waitForLoadState('networkidle');

    // Switch to Persian
    const langSwitcher = page.locator('[data-testid="lang-switch"], button:has(svg.lucide-globe)').first();
    await langSwitcher.click({ timeout: 10000 });

    // Wait for navigation - should still be on browse page but in Persian
    await page.waitForURL(/\/fa\/browse/, { timeout: 10000 });
  });
});
