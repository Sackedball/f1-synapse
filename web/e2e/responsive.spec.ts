import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const VIEWPORTS = [
  { width: 1024, height: 537, name: '1024x537-compact-laptop' },
  { width: 1150, height: 650, name: '1150x650-mid-laptop' },
  { width: 1280, height: 720, name: '1280x720' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 3440, height: 1440, name: '3440x1440-ultrawide' },
];

test.describe('Responsive Pass - Viewport Matrix', () => {
  const evidenceDir = path.resolve(process.cwd(), '../docs/web-revamp/evidence/phase-9/responsive');

  test.beforeAll(() => {
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
  });

  for (const vp of VIEWPORTS) {
    test(`Race workspace renders correctly at ${vp.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
      await page.waitForLoadState('networkidle');

      // Wait for table to be loaded
      await page.waitForSelector('[role="table"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Verify no horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Save evidence screenshot
      await page.screenshot({
        path: path.join(evidenceDir, `race-workspace-${vp.name}.png`),
      });
    });

    test(`Home page renders correctly at ${vp.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript(() => {
        sessionStorage.setItem('synapse.intro.v1', '1');
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.hero', { timeout: 10000 });
      await page.waitForTimeout(300);

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });
  }
});
