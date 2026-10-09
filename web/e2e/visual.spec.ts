import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Visual Regression & Snapshot Baselines', () => {
  const visualDir = path.resolve(process.cwd(), '../docs/web-revamp/evidence/phase-9/visual');

  test.beforeAll(() => {
    if (!fs.existsSync(visualDir)) {
      fs.mkdirSync(visualDir, { recursive: true });
    }
  });

  test.use({
    viewport: { width: 1920, height: 1080 },
  });

  test('Race workspace visual snapshot baseline', async ({ page }) => {
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[role="table"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(visualDir, 'race-workspace-baseline.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('Qualifying page visual snapshot baseline', async ({ page }) => {
    await page.goto('/quali/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(visualDir, 'qualifying-baseline.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('Home page visual snapshot baseline', async ({ page }) => {
    await page.goto('/?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=SESSION LAUNCHER', { timeout: 10000 });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(visualDir, 'home-baseline.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('Settings page visual snapshot baseline', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=APPLICATION SETTINGS', { timeout: 10000 });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(visualDir, 'settings-baseline.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
