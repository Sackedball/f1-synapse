import { test, expect } from '@playwright/test';

test.describe('Soak Test - Stability & Memory Budget', () => {
  test.setTimeout(180_000); // 3 minutes timeout

  test('Plays at high speed, scrubs repeatedly, and maintains stable memory with 0 console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known harmless browser warnings
        if (!text.includes('React DevTools') && !text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 1. Initial Load
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[role="table"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const initialHeap = await page.evaluate(() => {
      return (window.performance as any).memory?.usedJSHeapSize || 0;
    });

    // 2. Warm up session and play at high rate (press '4' for 8x/32x)
    await page.keyboard.press('Digit4');
    await page.keyboard.press('Space'); // Play
    await page.waitForTimeout(5000);

    // 3. Return to 1x and play
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(2000);

    // Measure post-warmup heap baseline with active decoded chunks
    const postWarmupHeap = await page.evaluate(() => {
      return (window.performance as any).memory?.usedJSHeapSize || 0;
    });

    // 4. Scrubbing stress test (30 random scrubs across timeline)
    for (let i = 0; i < 30; i++) {
      const seekSec = Math.floor(Math.random() * 120);
      await page.evaluate((s) => {
        const clock = (window as any).__clock;
        if (clock) {
          clock.seek(s);
        }
      }, seekSec);
      if (i % 5 === 0) {
        await page.waitForTimeout(50);
      }
    }

    // 5. Session navigation stress test (navigate back to home and return to race)
    await page.goto('/?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.goto('/race/suzuka-2026-r3?fixture=suzuka-2026-r3');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[role="table"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const finalHeap = await page.evaluate(() => {
      return (window.performance as any).memory?.usedJSHeapSize || 0;
    });

    // Verify 0 unhandled console errors
    expect(consoleErrors).toEqual([]);

    // Verify total memory is within 150MB budget and growth is stable
    if (finalHeap > 0) {
      console.log(`Final Heap: ${(finalHeap / 1024 / 1024).toFixed(2)} MB (Budget: 150 MB)`);
      expect(finalHeap).toBeLessThan(150 * 1024 * 1024);
    }
    if (postWarmupHeap > 0 && finalHeap > 0) {
      const growthRatio = (finalHeap - postWarmupHeap) / postWarmupHeap;
      console.log(`Post-warmup: ${(postWarmupHeap / 1024 / 1024).toFixed(2)} MB, Final: ${(finalHeap / 1024 / 1024).toFixed(2)} MB, Delta: ${(growthRatio * 100).toFixed(1)}%`);
      expect(growthRatio).toBeLessThan(0.5);
    }
  });
});
