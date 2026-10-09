import { Container, Graphics } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { TrackGeometry } from '@/api/types';
import { canvasPalette, lerpColor } from '../palette';

export class TrackAsphaltLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly glowGraphics: Graphics;

  private currentEdgeColor = canvasPalette.asphaltEdge;
  private targetEdgeColor = canvasPalette.asphaltEdge;
  private lastTrackStatus = 0;

  // Preallocated screen coordinates cache to avoid GC
  private outerScreen: Point2D[] = [];
  private innerScreen: Point2D[] = [];
  private centerScreen: Point2D[] = [];
  private quadScratch: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

  constructor() {
    this.container = new Container();
    this.glowGraphics = new Graphics();
    this.graphics = new Graphics();

    this.container.addChild(this.glowGraphics);
    this.container.addChild(this.graphics);
  }

  private ensureCapacity(count: number): void {
    while (this.outerScreen.length < count) {
      this.outerScreen.push({ x: 0, y: 0 });
      this.innerScreen.push({ x: 0, y: 0 });
      this.centerScreen.push({ x: 0, y: 0 });
    }
  }

  render(camera: Camera, track: TrackGeometry | null, trackStatus = 0, dtSec = 1 / 60): void {
    this.graphics.clear();
    this.glowGraphics.clear();
    if (!track) return;

    // Handle flag tint transition (200 ms)
    if (trackStatus !== this.lastTrackStatus) {
      this.lastTrackStatus = trackStatus;
      this.targetEdgeColor = canvasPalette.flagColors[trackStatus] ?? canvasPalette.asphaltEdge;
    }

    if (this.currentEdgeColor !== this.targetEdgeColor) {
      const step = Math.min(1, dtSec / 0.2);
      this.currentEdgeColor = lerpColor(this.currentEdgeColor, this.targetEdgeColor, step);
    }

    const { outer, inner, centerline } = track;
    const n = Math.min(outer?.length || 0, inner?.length || 0);
    if (n < 2) return;

    this.ensureCapacity(n);

    // Project world coordinates to screen space
    for (let i = 0; i < n; i++) {
      camera.worldToScreen(outer[i][0], outer[i][1], this.outerScreen[i]);
      camera.worldToScreen(inner[i][0], inner[i][1], this.innerScreen[i]);
    }

    const centerLen = centerline?.length || 0;
    this.ensureCapacity(centerLen);
    for (let i = 0; i < centerLen; i++) {
      camera.worldToScreen(centerline[i][0], centerline[i][1], this.centerScreen[i]);
    }

    // 1. Draw ribbon asphalt surface using quad strips (supports figure-8 crossovers like Suzuka)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const o1 = this.outerScreen[i];
      const o2 = this.outerScreen[next];
      const i2 = this.innerScreen[next];
      const i1 = this.innerScreen[i];

      this.quadScratch[0] = o1.x;
      this.quadScratch[1] = o1.y;
      this.quadScratch[2] = o2.x;
      this.quadScratch[3] = o2.y;
      this.quadScratch[4] = i2.x;
      this.quadScratch[5] = i2.y;
      this.quadScratch[6] = i1.x;
      this.quadScratch[7] = i1.y;

      this.graphics
        .poly(this.quadScratch)
        .fill({ color: canvasPalette.asphalt, alpha: 1.0 });
    }

    // 2. Soft outer glow (dual-pass for smooth broadcast falloff)
    this.glowGraphics.moveTo(this.outerScreen[0].x, this.outerScreen[0].y);
    for (let i = 1; i < n; i++) {
      this.glowGraphics.lineTo(this.outerScreen[i].x, this.outerScreen[i].y);
    }
    this.glowGraphics.lineTo(this.outerScreen[0].x, this.outerScreen[0].y);
    this.glowGraphics.stroke({
      width: 10,
      color: this.currentEdgeColor,
      alpha: 0.22,
    });

    this.glowGraphics.moveTo(this.outerScreen[0].x, this.outerScreen[0].y);
    for (let i = 1; i < n; i++) {
      this.glowGraphics.lineTo(this.outerScreen[i].x, this.outerScreen[i].y);
    }
    this.glowGraphics.lineTo(this.outerScreen[0].x, this.outerScreen[0].y);
    this.glowGraphics.stroke({
      width: 4,
      color: this.currentEdgeColor,
      alpha: 0.28,
    });

    // 3. Crisp outer edge line (1.5 px)
    this.graphics.moveTo(this.outerScreen[0].x, this.outerScreen[0].y);
    for (let i = 1; i < n; i++) {
      this.graphics.lineTo(this.outerScreen[i].x, this.outerScreen[i].y);
    }
    this.graphics.lineTo(this.outerScreen[0].x, this.outerScreen[0].y);
    this.graphics.stroke({
      width: 1.5,
      color: this.currentEdgeColor,
      alpha: 0.95,
    });

    // 4. Crisp inner edge line (1.5 px)
    this.graphics.moveTo(this.innerScreen[0].x, this.innerScreen[0].y);
    for (let i = 1; i < n; i++) {
      this.graphics.lineTo(this.innerScreen[i].x, this.innerScreen[i].y);
    }
    this.graphics.lineTo(this.innerScreen[0].x, this.innerScreen[0].y);
    this.graphics.stroke({
      width: 1.5,
      color: this.currentEdgeColor,
      alpha: 0.85,
    });

    // 5. Faint dashed centerline (1.2 px) & subtle direction chevrons
    if (centerLen > 1) {
      // Draw alternating dashes along centerline
      for (let i = 0; i < centerLen - 1; i += 2) {
        const p1 = this.centerScreen[i];
        const p2 = this.centerScreen[i + 1];
        this.graphics
          .moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .stroke({
            width: 1.2,
            color: canvasPalette.trackCenterline,
            alpha: 0.55,
          });
      }

      // Subtle direction chevrons every ~32 centerline points
      const chevronStep = Math.max(16, Math.floor(centerLen / 24));
      for (let i = 0; i < centerLen - 1; i += chevronStep) {
        const cur = this.centerScreen[i];
        const next = this.centerScreen[i + 1];
        const dx = next.x - cur.x;
        const dy = next.y - cur.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          const ux = dx / len;
          const uy = dy / len;
          // Normal perpendicular vector
          const nx = -uy;
          const ny = ux;

          const tipX = cur.x + ux * 4;
          const tipY = cur.y + uy * 4;
          const leftX = cur.x - ux * 3 + nx * 3.5;
          const leftY = cur.y - uy * 3 + ny * 3.5;
          const rightX = cur.x - ux * 3 - nx * 3.5;
          const rightY = cur.y - uy * 3 - ny * 3.5;

          this.graphics
            .moveTo(leftX, leftY)
            .lineTo(tipX, tipY)
            .lineTo(rightX, rightY)
            .stroke({
              width: 1.0,
              color: canvasPalette.trackCenterline,
              alpha: 0.45,
            });
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
