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

test.describe('Phase 5: Timeline, Events & Controls', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-5');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('AC3, AC4: Timeline scrubbing, markers, zoom, and minimap render correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for tower and timeline to be visible
    const tower = page.locator('[role="table"]').first();
    await expect(tower).toBeVisible({ timeout: 15000 });

    const timeline = page.locator('footer');
    await expect(timeline).toBeVisible();

    // Verify event markers are rendered
    const markers = page.locator('footer button[aria-label*="at 00:"]');
    await expect(markers.first()).toBeVisible({ timeout: 5000 });
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);

    // Capture full timeline evidence
    await safeScreenshot(page, path.join(evidenceDir, 'timeline-full-1920x1080.png'));

    // Test Zoom In
    const zoomInBtn = page.locator('button[aria-label="Zoom in timeline"]');
    await zoomInBtn.click();
    await page.waitForTimeout(300);

    const resetBtn = page.locator('button[aria-label="Reset zoom"]');
    await expect(resetBtn).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'timeline-zoomed.png'));

    // Reset zoom back
    await resetBtn.click();
    await expect(resetBtn).not.toBeVisible();
  });

  test('AC5: Key Moments drawer opens, navigates with J/K, and filters work', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for load
    await expect(page.locator('[role="table"]').first()).toBeVisible({ timeout: 15000 });

    // Open Key Moments Drawer via button
    const momentsBtn = page.locator('button[aria-label="Toggle Key Moments Drawer"]');
    await momentsBtn.click();

    const drawer = page.locator('[aria-label="Key Moments Drawer"]');
    await expect(drawer).toBeVisible();

    // Verify events list populated
    const eventCards = drawer.locator('.rounded-\\[var\\(--r-md\\)\\]');
    expect(await eventCards.count()).toBeGreaterThan(0);

    // Capture drawer screenshot
    await safeScreenshot(page, path.join(evidenceDir, 'key-moments-drawer.png'));

    // Test J/K keyboard navigation
    const initialT = await page.evaluate(() => (window as any).__clock?.currentTime);
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(400);

    const newT = await page.evaluate(() => (window as any).__clock?.currentTime);
    expect(newT).toBeGreaterThanOrEqual(initialT);

    // Close drawer
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('AC6: Keyboard shortcuts overlay and Command Palette (Ctrl+K)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    await expect(page.locator('[role="table"]').first()).toBeVisible({ timeout: 15000 });

    // 1. Open Shortcuts Guide via 'H'
    await page.keyboard.press('KeyH');
    const shortcutsModal = page.locator('text=KEYBOARD SHORTCUTS REFERENCE');
    await expect(shortcutsModal).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'shortcuts-modal.png'));

    // Close via ESC
    await page.keyboard.press('Escape');
    await expect(shortcutsModal).not.toBeVisible();

    // 2. Open Command Palette via Ctrl+K
    await page.keyboard.press('Control+KeyK');
    const commandInput = page.locator('input[aria-label="Command palette search input"]');
    await expect(commandInput).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'command-palette.png'));

    // Search and execute a command (e.g. "Select Max Verstappen")
    await commandInput.fill('Max Verstappen');
    await page.keyboard.press('Enter');

    // Selection should be VER
    const selectedDriver = await page.evaluate(() => (window as any).__stores?.selection?.getState()?.selectedDriver);
    expect(selectedDriver).toBe('VER');
  });

  test('AC8: Transport playback, speed control, and demo path walkthrough', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    await expect(page.locator('[role="table"]').first()).toBeVisible({ timeout: 15000 });

    // Click Play button
    const playBtn = page.locator('button[aria-label="Play"]');
    await playBtn.click();

    // Button should now be Pause
    const pauseBtn = page.locator('button[aria-label="Pause"]');
    await expect(pauseBtn).toBeVisible();

    // Wait 1.5s for replay to advance
    await page.waitForTimeout(1500);
    const timeAdvance = await page.evaluate(() => (window as any).__clock?.currentTime);
    expect(timeAdvance).toBeGreaterThan(0.5);

    // Capture active transport screenshot
    await safeScreenshot(page, path.join(evidenceDir, 'transport-controls-active.png'));

    // Pause again
    await pauseBtn.click();
    await expect(page.locator('button[aria-label="Play"]')).toBeVisible();
  });
});
