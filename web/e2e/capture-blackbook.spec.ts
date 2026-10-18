import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Black Book Evidence Capture Script', () => {
  const blackBookEvidenceDir = path.resolve(process.cwd(), '../docs/web-revamp/evidence/black-book');
  const blackBookFiguresDir = path.resolve(process.cwd(), '../blackbook_figures');

  test.beforeAll(() => {
    if (!fs.existsSync(blackBookEvidenceDir)) {
      fs.mkdirSync(blackBookEvidenceDir, { recursive: true });
    }
    if (!fs.existsSync(blackBookFiguresDir)) {
      fs.mkdirSync(blackBookFiguresDir, { recursive: true });
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
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'race-workspace-hero.png') });

    // 2. Battle focus with driver selection (VER) -> Fig 1
    const verRow = page.locator('[data-driver="VER"]');
    if (await verRow.isVisible()) {
      await verRow.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'battle-ml-chips.png') });
    await page.screenshot({ path: path.join(blackBookFiguresDir, 'fig1_implementation_system.png') });

    // 3. Analysis Workspace - Strategy preset -> Fig 2
    await page.goto('/analysis/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const stratTab = page.locator('button:has-text("Strategy")');
    if (await stratTab.isVisible()) {
      await stratTab.click();
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'analysis-strategist.png') });
    await page.screenshot({ path: path.join(blackBookFiguresDir, 'fig2_data_interpretation.png') });

    // 4. Analysis Workspace - Race Engineer preset
    const raceEngTab = page.locator('button:has-text("Race Engineer")');
    if (await raceEngTab.isVisible()) {
      await raceEngTab.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'analysis-race-engineer.png') });

    // 5. Qualifying results & telemetry -> Fig 3
    await page.goto('/quali/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'qualifying-results.png') });
    await page.screenshot({ path: path.join(blackBookFiguresDir, 'fig3_pipeline_or_model_insight.png') });

    // 6. Home calendar
    await page.goto('/?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.hero, .h-nav', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'home-calendar.png') });

    // 7. Settings page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('nav[aria-label="Sections"]', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(blackBookEvidenceDir, 'settings.png') });
  });
});
