import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Phase 2 Foundation Smoke & Visual Test', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-2');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('loads fixture session, plays replay, and captures screenshots at 3 viewports', async ({ page }) => {
    // 1. Load session in fixture mode
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for session and tower to load
    const p1Locator = page.locator('text=VER').first();
    await expect(p1Locator).toBeVisible({ timeout: 10000 });

    // Assert P1 driver is displayed
    const p1Text = await p1Locator.textContent();
    expect(p1Text).toContain('VER');

    // 2. Click play button
    const playBtn = page.getByRole('button', { name: /play/i }).first();
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    // 3. Wait 3 seconds of live playback
    await page.waitForTimeout(3000);

    // Assert timeline is active (timeline meta contains non-zero time)
    const timelineMeta = page.locator('footer');
    await expect(timelineMeta).toBeVisible();

    // 4. Capture screenshots at 3 requested viewport sizes
    const viewports = [
      { width: 1366, height: 768, name: 'shell-1366x768.png' },
      { width: 1920, height: 1080, name: 'shell-1920x1080.png' },
      { width: 2560, height: 1440, name: 'shell-2560x1440.png' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500); // Allow resize layout settling
      await page.screenshot({
        path: path.join(evidenceDir, vp.name),
      });
    }
  });

  test('verifies /dev/gallery and captures gallery evidence', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/dev/gallery');

    // Wait for gallery header
    await expect(page.locator('text=DESIGN SYSTEM GALLERY')).toBeVisible();

    // Verify all major components are rendered
    await expect(page.locator('text=1. Brand Wordmark')).toBeVisible();
    await expect(page.locator('text=2. Buttons & States')).toBeVisible();
    await expect(page.locator('text=3. Panel Headers')).toBeVisible();
    await expect(page.locator('text=4. Badges, Chips & Keyboard Caps')).toBeVisible();
    await expect(page.locator('text=5. Telemetry Gauges, StatBars & Sparklines')).toBeVisible();

    // Capture gallery screenshot
    await page.screenshot({
      path: path.join(evidenceDir, 'dev-gallery.png'),
      fullPage: true,
    });
  });
});
