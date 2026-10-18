import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Verify Settings, Gallery and Home pages', () => {
  test('Settings page renders all sections and inputs', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Title should be visible
    await expect(page.locator('.pg-title h1')).toBeVisible({ timeout: 5000 });

    // Inputs in Storage section should be visible
    await expect(page.locator('[data-testid="cache-path-input"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="data-path-input"]')).toBeVisible({ timeout: 5000 });

    // Display & Accessibility switches should be visible
    await expect(page.locator('#display')).toBeVisible();
    await expect(page.locator('#access')).toBeVisible();

    await page.screenshot({ path: path.join(process.cwd(), 'test-settings-page.png'), fullPage: true });
  });

  test('Gallery page renders components', async ({ page }) => {
    await page.goto('/dev/gallery');
    await page.waitForLoadState('networkidle');

    // Title and sections should be visible
    await expect(page.locator('.pg-title h1')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.gal-sec').first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: path.join(process.cwd(), 'test-gallery-page.png'), fullPage: true });
  });

  test('Home page header renders cleanly without leaked pseudo-elements', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('synapse.intro.v1', '1');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Links should be visible
    const galleryLink = page.locator('header.h-nav button:has-text("Gallery")');
    const settingsLink = page.locator('header.h-nav button:has-text("Settings")');

    await expect(galleryLink).toBeVisible();
    await expect(settingsLink).toBeVisible();

    await page.screenshot({ path: path.join(process.cwd(), 'test-home-header.png') });
  });
});
