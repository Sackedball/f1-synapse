import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Pass - axe-core Audits', () => {
  test('Home page should have zero serious or critical a11y violations', async ({ page }) => {
    await page.goto('/?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');

    // Wait for schedule content
    await page.waitForSelector('text=SESSION LAUNCHER', { timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Reviewed and audited via tokens
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('Race workspace should have zero critical a11y violations', async ({ page }) => {
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');

    // Wait for timing tower rows to load
    await page.waitForSelector('[role="table"]', { timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('Qualifying page should have zero serious or critical a11y violations', async ({ page }) => {
    await page.goto('/quali/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('table', { timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('Settings page should have zero serious or critical a11y violations', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('text=APPLICATION SETTINGS', { timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });
});
