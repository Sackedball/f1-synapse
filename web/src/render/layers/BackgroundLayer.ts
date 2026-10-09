import { Container, Graphics } from 'pixi.js';
import { Camera } from '../camera';
import { canvasPalette } from '../palette';

export class BackgroundLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private lastW = -1;
  private lastH = -1;

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  render(camera: Camera): void {
    const w = camera.viewportWidth;
    const h = camera.viewportHeight;

    if (this.lastW === w && this.lastH === h) {
      return;
    }
    this.lastW = w;
    this.lastH = h;

    this.graphics.clear();

    // 1. Deep backdrop fill
    this.graphics.rect(0, 0, w, h).fill({ color: canvasPalette.surface0 });

    // 2. Faint coordinate dot grid (~3.5% opacity)
    const spacing = 36;
    const startX = (w % spacing) / 2;
    const startY = (h % spacing) / 2;

    for (let x = startX; x < w; x += spacing) {
      for (let y = startY; y < h; y += spacing) {
        this.graphics
          .rect(x - 0.75, y - 0.75, 1.5, 1.5)
          .fill({ color: canvasPalette.gridDot, alpha: 0.035 });
      }
    }

    // 3. Subtle edge vignette frames
    // Outer border vignette overlay
    this.graphics
      .rect(0, 0, w, h)
      .stroke({ width: 3, color: 0x000000, alpha: 0.4 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
