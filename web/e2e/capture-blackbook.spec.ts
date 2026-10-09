import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Black Book Evidence Capture Script', () => {
  const blackBookDir = path.resolve(process.cwd(), '../docs/web-revamp/evidence/black-book');

  test.beforeAll(() => {
    if (!fs.existsSync(blackBookDir)) {
      fs.mkdirSync(blackBookDir, { recursive: true });
    }
  });

  test.use({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  test('Captures all canonical black-book screenshots', async ({ page }) => {
    // 1. Race workspace hero shot
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[role="table"]', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(blackBookDir, 'race-workspace-hero.png') });

    // 2. Battle focus with driver selection
    const verRow = page.locator('[data-driver="VER"]');
    if (await verRow.isVisible()) {
      await verRow.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(blackBookDir, 'battle-ml-chips.png') });

    // 3. Analysis Workspace - Race Engineer preset
    await page.goto('/analysis/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(blackBookDir, 'analysis-race-engineer.png') });

    // 4. Analysis Workspace - Strategist preset
    const presetBtn = page.locator('button:has-text("PRESET:")');
    if (await presetBtn.isVisible()) {
      await presetBtn.click();
      await page.waitForTimeout(300);
      const stratBtn = page.locator('button:has-text("Strategist")');
      if (await stratBtn.isVisible()) {
        await stratBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: path.join(blackBookDir, 'analysis-strategist.png') });

    // 5. Home calendar
    await page.goto('/?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=SESSION LAUNCHER', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(blackBookDir, 'home-calendar.png') });

    // 6. Qualifying results & telemetry
    await page.goto('/quali/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(blackBookDir, 'qualifying-results.png') });

    // 7. Settings page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=APPLICATION SETTINGS', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(blackBookDir, 'settings.png') });
  });
});
