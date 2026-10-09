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

test.describe('Phase 8: Home, Qualifying & Settings', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-8');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('Home screen with calendar grid, cache status, and recents', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?fixture=suzuka-2026-r3');

    // Verify header and title
    await expect(page.locator('h1')).toContainText('SEASON CALENDAR');

    // Wait for race cards to load
    const raceCard = page.locator('[data-testid^="race-card-round-"]').first();
    await expect(raceCard).toBeVisible({ timeout: 10000 });

    // Capture home calendar
    await safeScreenshot(page, path.join(evidenceDir, 'home-calendar-1920x1080.png'));

    // Open load modal by clicking race button
    const raceBtn = page.locator('[data-testid^="launch-race-btn-"]').first();
    await raceBtn.click();

    // Verify modal is visible
    const modal = page.locator('[data-testid="session-load-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Capture staged progress modal
    await safeScreenshot(page, path.join(evidenceDir, 'home-load-modal.png'));

    // Cancel modal
    const cancelBtn = page.locator('[data-testid="load-modal-cancel-btn"]');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('Qualifying view: classification table, sector splits, stacked charts, and mini-map', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/quali/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Verify page title and pole banner
    await expect(page.locator('h1')).toContainText('QUALIFYING TELEMETRY COMPARISON');
    await expect(page.locator('text=POLE: VER')).toBeVisible({ timeout: 10000 });

    // Verify rows in classification table
    const verRow = page.locator('[data-testid="quali-row-VER"]');
    await expect(verRow).toBeVisible();

    // Wait for telemetry charts and mini-map to render
    await page.waitForTimeout(1500);

    // Capture overall qualifying view
    await safeScreenshot(page, path.join(evidenceDir, 'quali-results-1920x1080.png'));

    // Advance playback slightly
    const playBtn = page.locator('[data-testid="quali-play-btn"]');
    await playBtn.click();
    await page.waitForTimeout(2000);
    await playBtn.click(); // Pause

    // Capture stacked distance charts & mini map with moving markers
    await safeScreenshot(page, path.join(evidenceDir, 'quali-telemetry-stacked.png'));
  });

  test('Settings page: validated data paths, cache cleanup modal, units toggle, and shortcuts reference', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/settings?fixture=suzuka-2026-r3');

    // Verify settings header
    await expect(page.locator('h1')).toContainText('APPLICATION SETTINGS');

    // Verify inputs
    await expect(page.locator('[data-testid="cache-path-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-path-input"]')).toBeVisible();

    // Capture settings data paths & storage
    await safeScreenshot(page, path.join(evidenceDir, 'settings-data-paths.png'));

    // Open clear cache modal
    const clearBtn = page.locator('[data-testid="open-clear-cache-modal-btn"]');
    await clearBtn.click();
    await expect(page.locator('text=Clear FastF1 Cache Files')).toBeVisible();

    // Capture modal dialog
    await safeScreenshot(page, path.join(evidenceDir, 'settings-clear-modal.png'));

    // Cancel modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Scroll to display & keyboard shortcuts section
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);

    // Capture display, accessibility, shortcuts, about
    await safeScreenshot(page, path.join(evidenceDir, 'settings-display-shortcuts.png'));
  });
});
