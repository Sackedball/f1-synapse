import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { TrackGeometry } from '@/api/types';
import { canvasPalette } from '../palette';

export class FinishLineLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly gantryGraphics: Graphics;
  private readonly tagText: Text;
  private ptInner: Point2D = { x: 0, y: 0 };
  private ptOuter: Point2D = { x: 0, y: 0 };
  private ptGrid: Point2D = { x: 0, y: 0 };
  private segmentScratch: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

  private tagStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 7.5,
    fontWeight: 'bold',
    fill: canvasPalette.text2,
    letterSpacing: 0.5,
  });

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.gantryGraphics = new Graphics();
    this.tagText = new Text({ text: 'START / FINISH', style: this.tagStyle });
    this.tagText.anchor.set(0.5);

    this.container.addChild(this.graphics);
    this.container.addChild(this.gantryGraphics);
    this.container.addChild(this.tagText);
  }

  render(camera: Camera, track: TrackGeometry | null, time = 0): void {
    this.graphics.clear();
    this.gantryGraphics.clear();
    this.tagText.visible = false;
    if (!track || !track.inner || !track.outer) return;

    const idx = Math.max(0, Math.min(track.finishIndex || 0, track.inner.length - 1));
    camera.worldToScreen(track.inner[idx][0], track.inner[idx][1], this.ptInner);
    camera.worldToScreen(track.outer[idx][0], track.outer[idx][1], this.ptOuter);

    const x1 = this.ptInner.x;
    const y1 = this.ptInner.y;
    const x2 = this.ptOuter.x;
    const y2 = this.ptOuter.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    // Normal vector perpendicular to the finish line for checker thickness
    const nx = -dy / len;
    const ny = dx / len;
    const thickness = Math.max(2, Math.min(6, 4 * (camera.zoom / camera.fitZoom)));

    // 1. Draw checkered segments across track width
    const segments = 10;
    for (let s = 0; s < segments; s++) {
      const tA = s / segments;
      const tB = (s + 1) / segments;

      const pAx = x1 + dx * tA;
      const pAy = y1 + dy * tA;
      const pBx = x1 + dx * tB;
      const pBy = y1 + dy * tB;

      const color = s % 2 === 0 ? canvasPalette.finishLineWhite : canvasPalette.finishLineDark;

      this.segmentScratch[0] = pAx - nx * thickness;
      this.segmentScratch[1] = pAy - ny * thickness;
      this.segmentScratch[2] = pBx - nx * thickness;
      this.segmentScratch[3] = pBy - ny * thickness;
      this.segmentScratch[4] = pBx + nx * thickness;
      this.segmentScratch[5] = pBy + ny * thickness;
      this.segmentScratch[6] = pAx + nx * thickness;
      this.segmentScratch[7] = pAy + ny * thickness;

      this.graphics
        .poly(this.segmentScratch)
        .fill({ color, alpha: 0.95 });
    }

    // 2. Solid bright start/finish line stroke
    this.graphics
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ width: 2, color: canvasPalette.text1, alpha: 0.95 });

    // 3. Overhead Gantry towers and beam graphic
    const towerW = 6;
    const towerH = 10;
    // Outer tower
    this.gantryGraphics
      .roundRect(x2 - towerW / 2, y2 - towerH / 2, towerW, towerH, 1.5)
      .fill({ color: canvasPalette.surface3, alpha: 0.95 })
      .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.9 });
    // Inner tower
    this.gantryGraphics
      .roundRect(x1 - towerW / 2, y1 - towerH / 2, towerW, towerH, 1.5)
      .fill({ color: canvasPalette.surface3, alpha: 0.95 })
      .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.9 });
    // Connecting gantry truss line
    this.gantryGraphics
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ width: 1.2, color: canvasPalette.borderStrong, alpha: 0.65 });

    // 4. "START / FINISH" tag badge
    const tagX = x2 + nx * 14;
    const tagY = y2 + ny * 14;
    const isTagVisible = camera.zoom >= camera.fitZoom * 0.6;
    if (isTagVisible) {
      this.tagText.x = tagX;
      this.tagText.y = tagY;
      this.tagText.visible = true;

      this.gantryGraphics
        .roundRect(tagX - 28, tagY - 8, 56, 16, 3)
        .fill({ color: canvasPalette.labelBg, alpha: 0.9 })
        .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.75 });
    }

    // 5. Grid slot markers when t is near 0 (fades out as t -> 10s)
    const gridAlpha = Math.max(0, Math.min(1, (10 - time) / 10));
    if (gridAlpha > 0.05 && track.centerline) {
      const centerLen = track.centerline.length;
      const numSlots = 10; // 10 pairs = 20 slots
      const stepIdx = Math.max(2, Math.floor(centerLen / 120));

      for (let s = 1; s <= numSlots; s++) {
        const slotIdx = (idx - s * stepIdx + centerLen) % centerLen;
        const pt = track.centerline[slotIdx];
        if (!pt) continue;
        camera.worldToScreen(pt[0], pt[1], this.ptGrid);

        const sideSign = s % 2 === 0 ? 1 : -1;
        const boxX = this.ptGrid.x + (dx / len) * 7 * sideSign;
        const boxY = this.ptGrid.y + (dy / len) * 7 * sideSign;

        // Small grid box marker
        this.graphics
          .rect(boxX - 3.5, boxY - 2.5, 7, 5)
          .stroke({ width: 1, color: canvasPalette.textDisabled, alpha: gridAlpha * 0.65 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
