import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { canvasPalette } from '../palette';

export class FpsOverlay {
  readonly container: Container;
  private readonly bg: Graphics;
  private readonly text: Text;

  private frameCount = 0;
  private lastUpdateTime = performance.now();
  private smoothedFps = 60;
  private smoothedSampleMs = 0;
  private smoothedRenderMs = 0;

  constructor() {
    this.container = new Container();
    this.bg = new Graphics();

    this.text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        fontWeight: 'bold',
        fill: canvasPalette.text1,
        lineHeight: 14,
      }),
    });
    this.text.x = 10;
    this.text.y = 8;

    this.container.addChild(this.bg);
    this.container.addChild(this.text);
    this.container.visible = false;
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  toggle(): boolean {
    this.container.visible = !this.container.visible;
    return this.container.visible;
  }

  updateMetrics(sampleMs: number, renderMs: number, carCount: number): void {
    if (!this.container.visible) return;

    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastUpdateTime;

    this.smoothedSampleMs = this.smoothedSampleMs * 0.9 + sampleMs * 0.1;
    this.smoothedRenderMs = this.smoothedRenderMs * 0.9 + renderMs * 0.1;

    // Update display text roughly every 200 ms
    if (elapsed >= 200) {
      this.smoothedFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastUpdateTime = now;

      const totalMs = this.smoothedSampleMs + this.smoothedRenderMs;
      const lines = [
        `FPS:    ${this.smoothedFps}`,
        `SMPL:   ${this.smoothedSampleMs.toFixed(2)} ms`,
        `RNDR:   ${this.smoothedRenderMs.toFixed(2)} ms`,
        `TOTL:   ${totalMs.toFixed(2)} ms`,
        `CARS:   ${carCount}`,
      ];

      this.text.text = lines.join('\n');

      this.bg.clear();
      this.bg
        .roundRect(4, 4, 130, 80, 4)
        .fill({ color: canvasPalette.surface0, alpha: 0.88 })
        .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.85 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
