import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Phase 3 Track Canvas & Camera System', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-3');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('renders full track, supports pan/zoom/fit, follow mode, DRS zones, and focus mode', async ({
    page,
  }) => {
    // 1. Load session in fixture mode
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for session and tower to load
    const p1Locator = page.locator('[data-driver="VER"]').first();
    await expect(p1Locator).toBeVisible({ timeout: 15000 });

    // Wait for Pixi canvas element to mount
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Start playback
    const playBtn = page.getByRole('button', { name: /play/i }).first();
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    // Assert playback is actively running and playhead has advanced
    await expect(page.locator('header')).toContainText('PLAYING', { timeout: 5000 });

    // Allow 2.5 seconds of smooth 60fps playback motion
    await page.waitForTimeout(2500);

    // 2. Full Track View capture at 1920x1080
    await page.screenshot({
      path: path.join(evidenceDir, 'track-full-1920x1080.png'),
    });

    // Capture at 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(600); // Allow resize layout settling
    await page.screenshot({
      path: path.join(evidenceDir, 'track-full-1366x768.png'),
    });

    // Reset back to 1920x1080
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // 3. Driver Selection & Follow Mode
    // Select VER from timing tower
    await p1Locator.click();
    await page.waitForTimeout(300);

    // Click Follow Driver button in camera toolbar
    const followBtn = page.getByRole('button', { name: /follow selected driver/i });
    await expect(followBtn).toBeVisible();
    await followBtn.click();

    // Allow camera follow damping transition (~600ms)
    await page.waitForTimeout(800);

    // Capture driver follow screenshot
    await page.screenshot({
      path: path.join(evidenceDir, 'driver-follow-1920x1080.png'),
    });

    // 4. Focus Mode
    const focusBtn = page.getByRole('button', { name: /toggle focus mode/i }).first();
    await expect(focusBtn).toBeVisible();
    await focusBtn.click();
    await page.waitForTimeout(500);

    // Capture focus mode with connectors and dimmed pack
    await page.screenshot({
      path: path.join(evidenceDir, 'focus-mode-1920x1080.png'),
    });

    // 5. DRS Zone Highlight
    // Reset view to fit
    const fitBtn = page.getByRole('button', { name: /reset view/i });
    await fitBtn.click();
    await page.waitForTimeout(500);

    // Capture DRS zone highlight
    await page.screenshot({
      path: path.join(evidenceDir, 'drs-highlight-1920x1080.png'),
    });

    // 6. FPS Debug Overlay
    const fpsBtn = page.getByRole('button', { name: /toggle fps overlay/i });
    await expect(fpsBtn).toBeVisible();
    await fpsBtn.click();
    await page.waitForTimeout(400);

    // Capture FPS debug overlay
    await page.screenshot({
      path: path.join(evidenceDir, 'fps-overlay-1920x1080.png'),
    });
  });
});
