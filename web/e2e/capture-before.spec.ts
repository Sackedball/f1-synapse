import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Phase 3.5 Step 0: Capture Before Screenshots', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-3b/before');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('captures before screenshots at 1920x1080 and 1366x768 at T+0, T+40, T+100', async ({ page }) => {
    // 1. 1920x1080 viewports
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for session and tower to load
    const p1Locator = page.locator('text=VER').first();
    await expect(p1Locator).toBeVisible({ timeout: 15000 });

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // T+0 at 1920x1080
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1920x1080-t0.png'),
    });

    // Seek to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(800);

    // T+40s at 1920x1080
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1920x1080-t40.png'),
    });

    // Seek to T+100s
    await page.evaluate(() => {
      (window as any).__clock?.seek(100);
    });
    await page.waitForTimeout(800);

    // T+100s at 1920x1080
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1920x1080-t100.png'),
    });

    // 2. 1366x768 viewports
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(800);

    // T+100s at 1366x768
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1366x768-t100.png'),
    });

    // Seek back to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(800);

    // T+40s at 1366x768
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1366x768-t40.png'),
    });

    // Seek back to T+0
    await page.evaluate(() => {
      (window as any).__clock?.seek(0);
    });
    await page.waitForTimeout(800);

    // T+0 at 1366x768
    await page.screenshot({
      path: path.join(evidenceDir, 'before-1366x768-t0.png'),
    });
  });
});
