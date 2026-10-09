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

test.describe('Phase 4: Timing Tower, HUD & Context Panel', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-4');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('renders workspace at 1920x1080, 1366x768, 2560x1440 at T+60s with zero bounding-box overlaps', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080, name: '1920x1080' },
      { width: 1366, height: 768, name: '1366x768' },
      { width: 2560, height: 1440, name: '2560x1440' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

      // Wait for tower and canvas
      const tower = page.locator('[role="table"]').first();
      await expect(tower).toBeVisible({ timeout: 15000 });

      // Seek to T+60s
      await page.evaluate(() => {
        (window as any).__clock?.seek(60);
      });
      await page.waitForTimeout(800);

      // Check no horizontal scrollbar
      const hasHorizontalScrollbar = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScrollbar).toBe(false);

      // Check bounding box non-intersection of major panels
      const overlaps = await page.evaluate(() => {
        const header = document.querySelector('header');
        const towerEl = document.querySelector('[role="table"]');
        const canvasEl = document.querySelector('main');
        const contextEl = document.querySelector('aside[aria-label*="Panel"]');

        const rects = [
          { name: 'header', r: header?.getBoundingClientRect() },
          { name: 'tower', r: towerEl?.getBoundingClientRect() },
          { name: 'canvas', r: canvasEl?.getBoundingClientRect() },
          { name: 'context', r: contextEl?.getBoundingClientRect() },
        ].filter((item) => item.r && item.r.width > 0 && item.r.height > 0);

        const intersecting: string[] = [];
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i].r!;
            const b = rects[j].r!;
            // Check true overlap (strict interior intersection)
            const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (xOverlap > 1 && yOverlap > 1) {
              intersecting.push(`${rects[i].name} overlaps ${rects[j].name} (${xOverlap}x${yOverlap}px)`);
            }
          }
        }
        return intersecting;
      });
      expect(overlaps).toHaveLength(0);

      // Capture screenshot
      await safeScreenshot(page, path.join(evidenceDir, `workspace-${vp.name}-t60.png`));
    }
  });

  test('verifies tower selection, I/L toggle, and driver comparison at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    await expect(page.locator('text=VER').first()).toBeVisible({ timeout: 15000 });

    // Seek to T+40s
    await page.evaluate(() => {
      (window as any).__clock?.seek(40);
    });
    await page.waitForTimeout(600);

    // 1. Click VER in tower to select
    const verRow = page.locator('[data-driver="VER"]').first();
    await verRow.click();
    await page.waitForTimeout(400);

    // Verify Context Panel shows VER telemetry
    await expect(page.locator('text=MAX VERSTAPPEN').first()).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'single-driver-focus.png'));

    // 2. Toggle I/L button
    const ldrButton = page.locator('button[aria-label="Leader Gap Mode"]').first();
    await ldrButton.click();
    await page.waitForTimeout(300);
    await safeScreenshot(page, path.join(evidenceDir, 'tower-leader-gaps.png'));

    // 3. Shift-click NOR in tower to activate 2-driver compare
    const norRow = page.locator('[data-driver="NOR"]').first();
    await norRow.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(400);

    // Verify compare header and deltas
    await expect(page.locator('text=SPEED Δ').first()).toBeVisible();
    await expect(page.locator('text=TIME GAP').first()).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'two-driver-compare.png'));

    // 4. Shift-click LEC to activate 3-driver compare
    const lecRow = page.locator('[data-driver="LEC"]').first();
    await lecRow.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(400);
    await safeScreenshot(page, path.join(evidenceDir, 'three-driver-compare-1366x768.png'));

    // Verify no vertical window overflow at 1366x768
    const hasVerticalWindowScroll = await page.evaluate(() => {
      return document.documentElement.scrollHeight > document.documentElement.clientHeight;
    });
    expect(hasVerticalWindowScroll).toBe(false);
  });
});
