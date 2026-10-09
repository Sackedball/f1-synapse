import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function safeScreenshot(page: Page, targetPath: string) {
  const buf = await page.screenshot();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.writeFileSync(targetPath, buf);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

test.describe('Phase 3.5 Step 6: Capture After Screenshots', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-3b/after');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('captures baseline after screenshots at 1920x1080 and 1366x768', async ({ page }) => {
    // 1. 1920x1080 viewports
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for session, tower, and canvas to be ready
    const p1Locator = page.locator('text=VER').first();
    await expect(p1Locator).toBeVisible({ timeout: 15000 });

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // T+0 at 1920x1080
    await safeScreenshot(page, path.join(evidenceDir, 'after-1920x1080-t0.png'));
    await page.waitForTimeout(400);

    // Seek to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(800);

    // T+40s at 1920x1080
    await safeScreenshot(page, path.join(evidenceDir, 'after-1920x1080-t40.png'));
    await page.waitForTimeout(400);

    // Seek to T+100s
    await page.evaluate(() => {
      (window as any).__clock?.seek(100);
    });
    await page.waitForTimeout(800);

    // T+100s at 1920x1080
    await safeScreenshot(page, path.join(evidenceDir, 'after-1920x1080-t100.png'));
    await page.waitForTimeout(400);

    // 2. 1366x768 viewports
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(800);

    // T+100s at 1366x768
    await safeScreenshot(page, path.join(evidenceDir, 'after-1366x768-t100.png'));
    await page.waitForTimeout(400);

    // Seek back to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(800);

    // T+40s at 1366x768
    await safeScreenshot(page, path.join(evidenceDir, 'after-1366x768-t40.png'));
    await page.waitForTimeout(400);

    // Seek back to T+0
    await page.evaluate(() => {
      (window as any).__clock?.seek(0);
    });
    await page.waitForTimeout(800);

    // T+0 at 1366x768
    await safeScreenshot(page, path.join(evidenceDir, 'after-1366x768-t0.png'));
  });

  test('captures elevated validation states (follow, focus, drs, fps)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    const p1Locator = page.locator('text=VER').first();
    await expect(p1Locator).toBeVisible({ timeout: 15000 });
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Seek to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(800);

    // State A: Driver Follow Mode (select VER and activate follow)
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.selection.getState().setSelectedDriver('VER');
        stores.ui.getState().setCameraMode('follow');
      }
    });
    await page.waitForTimeout(800);
    await safeScreenshot(page, path.join(evidenceDir, 'after-follow-mode.png'));
    await page.waitForTimeout(400);

    // State B: Focus Mode (dim non-focused, draw ahead/behind connectors)
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.ui.getState().setFocusMode(true);
      }
    });
    await page.waitForTimeout(800);
    await safeScreenshot(page, path.join(evidenceDir, 'after-focus-mode.png'));
    await page.waitForTimeout(400);

    // State C: Active DRS Zone
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.ui.getState().setFocusMode(false);
        stores.ui.getState().setCameraMode('fit');
      }
      (window as any).__clock?.seek(85);
    });
    await page.waitForTimeout(800);
    await safeScreenshot(page, path.join(evidenceDir, 'after-drs-active.png'));
    await page.waitForTimeout(400);

    // State D: FPS Overlay
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.ui.getState().setShowFps(true);
      }
    });
    await page.waitForTimeout(600);
    await safeScreenshot(page, path.join(evidenceDir, 'after-fps-overlay.png'));
  });
});
