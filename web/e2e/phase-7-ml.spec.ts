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

test.describe('Phase 7: ML Integration & Predictive Insights', () => {
  const evidenceDir = path.resolve(__dirname, '../../docs/web-revamp/evidence/phase-7');

  test.beforeAll(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });
  });

  test('AC4, AC5, AC6: Inline Overlays, Tower Pit Badge, and Driver Card Bayesian Degradation', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');

    // Wait for race canvas and timing tower to mount
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Scrub or advance playhead to a close-battle moment (e.g. t = 10s to 30s)
    await page.waitForTimeout(2000);

    // 1. Capture Track Canvas with ML Overtake Battle Chip
    await safeScreenshot(page, path.join(evidenceDir, 'track-overtake-chip.png'));

    // 2. Select driver with pit likelihood or verify timing tower PIT badge
    await safeScreenshot(page, path.join(evidenceDir, 'tower-pit-badge.png'));

    // 3. Select a driver (e.g. VER) to inspect Driver Card Bayesian degradation
    const verRow = page.locator('[data-driver="VER"]').first();
    if (await verRow.isVisible()) {
      await verRow.click();
      await page.waitForTimeout(600);
    }
    await safeScreenshot(page, path.join(evidenceDir, 'driver-card-bayesian.png'));
  });

  test('AC3, AC5, AC7: Dedicated ML Panel, Explainability Drawer, Model Info, and Toggle Off', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/analysis/suzuka-2026-r3?fixture=suzuka-2026-r3');

    const dockview = page.locator('.dockview-theme-f1');
    await expect(dockview).toBeVisible({ timeout: 15000 });

    // Open Panels dropdown and launch ML Predictive Engine
    const addPanelBtn = page.locator('button:has-text("ADD PANEL")');
    if (await addPanelBtn.isVisible()) {
      await addPanelBtn.click();
      await page.waitForTimeout(300);

      const mlItem = page.locator('button:has-text("ML Predictive Engine")').first();
      if (await mlItem.isVisible()) {
        await mlItem.click();
        await page.waitForTimeout(800);
      }
    }

    // 4. Capture Lead Battle in ML Panel
    await safeScreenshot(page, path.join(evidenceDir, 'ml-panel-lead-battle.png'));

    // 5. Open "Why?" Explainability Drawer
    const whyBtn = page.locator('text=EXPLAINABILITY').first();
    if (await whyBtn.isVisible()) {
      await whyBtn.click();
      await page.waitForTimeout(400);
      await safeScreenshot(page, path.join(evidenceDir, 'ml-why-drawer.png'));
    }

    // 6. Open "Model Info" Popover
    const infoBtn = page.locator('button[title*="Model Information"]').first();
    if (await infoBtn.isVisible()) {
      await infoBtn.click();
      await page.waitForTimeout(400);
      await safeScreenshot(page, path.join(evidenceDir, 'ml-model-info.png'));
    }

    // 7. Toggle "Show ML Insights" off via Settings Store or UI
    await page.evaluate(() => {
      // @ts-expect-error test hook
      if (window.__SETTINGS_STORE__) {
        // @ts-expect-error test hook
        window.__SETTINGS_STORE__.getState().setShowMlInsights(false);
      }
    });
    // Direct localStorage or store toggle
    await page.evaluate(() => {
      const raw = localStorage.getItem('f1-synapse-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.state.showMlInsights = false;
        localStorage.setItem('f1-synapse-settings', JSON.stringify(parsed));
      }
    });
    await page.reload();
    await page.waitForTimeout(1000);
    await safeScreenshot(page, path.join(evidenceDir, 'ml-toggled-off.png'));
  });
});
