import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test('should display mobile navigation', async ({ page }) => {
    await page.goto('/');
    // Should have mobile menu button (hamburger)
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu"], .hamburger, button:has(svg)').first();
    await expect(mobileMenuBtn).toBeVisible();
  });

  test('should open mobile menu on click', async ({ page }) => {
    await page.goto('/');
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu"], .hamburger, header button:has(svg)').first();
    await mobileMenuBtn.click();

    // Mobile menu should be visible with navigation links
    const mobileNav = page.locator('nav a, [data-testid="mobile-nav"] a').first();
    await expect(mobileNav).toBeVisible();
  });

  test('should display skill cards in single column', async ({ page }) => {
    await page.goto('/browse');
    // Wait for skills to load
    await page.waitForSelector('a[href*="/skill/"], [data-testid="skill-card"]', { timeout: 10000 });

    // Check that cards are stacked (single column layout)
    const cards = page.locator('[data-testid="skill-card"], article, .skill-card');
    const cardCount = await cards.count();
    if (cardCount >= 2) {
      const firstBox = await cards.first().boundingBox();
      const secondBox = await cards.nth(1).boundingBox();
      if (firstBox && secondBox) {
        // In single column, second card should be below first
        expect(secondBox.y).toBeGreaterThan(firstBox.y);
      }
    }
  });

  test('should have readable text size on mobile', async ({ page }) => {
    await page.goto('/');
    // Main heading should have reasonable font size for mobile
    const heading = page.locator('h1').first();
    const fontSize = await heading.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });
    const fontSizeNum = parseInt(fontSize);
    expect(fontSizeNum).toBeGreaterThanOrEqual(16); // At least 16px
  });

  test('should have touch-friendly buttons', async ({ page }) => {
    await page.goto('/');
    // Primary action buttons should be large enough for touch
    // Look for primary/main buttons (not small icon buttons)
    const primaryButtons = page.locator('.btn-primary, button.btn-primary, [role="button"].btn-primary');
    const buttonCount = await primaryButtons.count();

    if (buttonCount > 0) {
      const firstButton = primaryButtons.first();
      const box = await firstButton.boundingBox();
      if (box) {
        // Primary buttons should be at least 32px height
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
    } else {
      // If no primary buttons, check any visible button has reasonable minimum
      const allButtons = page.locator('button, a.btn, [role="button"]').filter({ hasText: /\S/ }); // buttons with text
      const anyButtonCount = await allButtons.count();
      if (anyButtonCount > 0) {
        const anyButton = allButtons.first();
        const box = await anyButton.boundingBox();
        if (box) {
          // Buttons with text should be at least 24px height (reasonable for mobile)
          expect(box.height).toBeGreaterThanOrEqual(24);
        }
      }
    }
  });
});
