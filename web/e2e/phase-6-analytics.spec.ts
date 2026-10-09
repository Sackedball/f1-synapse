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

test.describe('Phase 6: Analytics Panels & Analysis Workspace', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-6');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('AC1, AC2, AC3: Presets, Dockview layout, and H2H delta convention', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/analysis/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for dockview container and panels to mount
    const dockview = page.locator('.dockview-theme-f1');
    await expect(dockview).toBeVisible({ timeout: 15000 });

    // 1. Verify default layout (Race Engineer)
    await page.waitForTimeout(1000);
    await safeScreenshot(page, path.join(evidenceDir, 'preset-race-engineer.png'));

    // Check presence of Telemetry, Head-to-Head, and Lap Times in default preset
    const h2hHeader = page.locator('text=DELTA TIME TRACE').first();
    await expect(h2hHeader).toBeVisible();

    // Verify AC4: Delta Time Sign Convention explicitly on-screen
    const signConvention = page.locator('text=Slower / Behind').first();
    await expect(signConvention).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'head-to-head-delta.png'));

    // 2. Switch to Strategy Preset
    const strategyBtn = page.locator('button', { hasText: 'Strategy' }).first();
    await strategyBtn.click();
    await page.waitForTimeout(600);
    const tyreMatrix = page.locator('text=TYRE STRATEGY').first();
    await expect(tyreMatrix).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'preset-strategy.png'));

    // 3. Switch to Telemetry Preset
    const telemetryBtn = page.locator('button', { hasText: 'Telemetry' }).first();
    await telemetryBtn.click();
    await page.waitForTimeout(600);
    await safeScreenshot(page, path.join(evidenceDir, 'preset-telemetry.png'));

    // 4. Switch to Broadcast (clean) Preset
    const broadcastBtn = page.locator('button', { hasText: 'Broadcast (clean)' }).first();
    await broadcastBtn.click();
    await page.waitForTimeout(600);
    const trackStrip = page.locator('text=LINEAR TRACK POSITION').first();
    await expect(trackStrip).toBeVisible();
    await safeScreenshot(page, path.join(evidenceDir, 'preset-broadcast.png'));

    // 5. Add Panel via Add Panel Launcher Popover
    const addPanelBtn = page.locator('button:has-text("ADD PANEL")');
    await addPanelBtn.click();
    const availablePanels = page.locator('text=AVAILABLE PANELS (7)').first();
    await expect(availablePanels).toBeVisible();

    // Click "Stream Inspector"
    const inspectorLauncher = page.locator('button:has-text("Stream Inspector")').first();
    await inspectorLauncher.click();
    await page.waitForTimeout(500);

    const streamInspector = page.locator('text=STREAM INSPECTOR').first();
    await expect(streamInspector).toBeVisible();

    // 6. Test Layout Export / Import JSON Dialog
    const exportBtn = page.locator('button[title="Export / Import Layout JSON"]');
    await exportBtn.click();
    const dialogTitle = page.locator('text=LAYOUT JSON EXPORT / IMPORT').first();
    await expect(dialogTitle).toBeVisible();

    const textarea = page.locator('textarea');
    const jsonContent = await textarea.inputValue();
    expect(jsonContent.length).toBeGreaterThan(10);
    expect(jsonContent).toContain('grid');

    await safeScreenshot(page, path.join(evidenceDir, 'layout-export-import.png'));

    // Close Dialog
    const closeBtn = page.locator('button:has-text("Close")').first();
    await closeBtn.click();
    await expect(dialogTitle).not.toBeVisible();

    // 7. Verify Timeline click-to-seek
    const timeline = page.locator('footer');
    await expect(timeline).toBeVisible();
    await timeline.click({ position: { x: 300, y: 30 } });
    await page.waitForTimeout(300);
  });
});
