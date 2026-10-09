import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { canvasPalette } from '../palette';

export class FocusDimLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly gapAheadText: Text;
  private readonly gapBehindText: Text;

  private ptSel: Point2D = { x: 0, y: 0 };
  private ptAhead: Point2D = { x: 0, y: 0 };
  private ptBehind: Point2D = { x: 0, y: 0 };

  private textStyle = new TextStyle({
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    fontWeight: 'bold',
    fill: canvasPalette.text1,
  });

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();

    this.gapAheadText = new Text({ text: '', style: this.textStyle });
    this.gapAheadText.anchor.set(0.5);

    this.gapBehindText = new Text({ text: '', style: this.textStyle });
    this.gapBehindText.anchor.set(0.5);

    this.container.addChild(this.graphics);
    this.container.addChild(this.gapAheadText);
    this.container.addChild(this.gapBehindText);
  }

  private formatGap(seconds: number): string {
    if (isNaN(seconds) || seconds === null) return '';
    return seconds >= 1.0 ? `+${seconds.toFixed(1)}s` : `+${seconds.toFixed(3)}s`;
  }

  render(
    camera: Camera,
    snapshot: Snapshot,
    drivers: DriverInfo[],
    selectedDriver: string | null = null,
    focusMode = false,
  ): void {
    this.graphics.clear();
    this.gapAheadText.visible = false;
    this.gapBehindText.visible = false;

    if (!focusMode || !selectedDriver) return;

    // Find selected driver index
    let selIdx = -1;
    for (let i = 0; i < drivers.length; i++) {
      if (drivers[i].code === selectedDriver) {
        selIdx = i;
        break;
      }
    }
    if (selIdx === -1 || snapshot.status[selIdx] !== 0) return;

    // Find car position in race order
    const n = Math.min(snapshot.n, drivers.length);
    let selPos = -1;
    for (let p = 0; p < n; p++) {
      if (snapshot.orderByPosition && snapshot.orderByPosition[p] === selIdx) {
        selPos = p;
        break;
      }
    }
    if (selPos === -1) return;

    camera.worldToScreen(snapshot.x[selIdx], snapshot.y[selIdx], this.ptSel);

    // 1. Connector to car ahead
    if (selPos > 0) {
      const aheadIdx = snapshot.orderByPosition[selPos - 1];
      if (aheadIdx < n && snapshot.status[aheadIdx] === 0) {
        camera.worldToScreen(snapshot.x[aheadIdx], snapshot.y[aheadIdx], this.ptAhead);

        this.graphics
          .moveTo(this.ptSel.x, this.ptSel.y)
          .lineTo(this.ptAhead.x, this.ptAhead.y)
          .stroke({ width: 1.5, color: canvasPalette.text2, alpha: 0.65 });

        const midX = (this.ptSel.x + this.ptAhead.x) / 2;
        const midY = (this.ptSel.y + this.ptAhead.y) / 2;

        const gapSec = snapshot.gapAhead[selIdx];
        const gapStr = this.formatGap(gapSec);
        if (gapStr) {
          this.graphics
            .roundRect(midX - 22, midY - 8, 44, 16, 3)
            .fill({ color: canvasPalette.labelBg, alpha: 0.92 })
            .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.85 });

          this.gapAheadText.text = gapStr;
          this.gapAheadText.x = midX;
          this.gapAheadText.y = midY;
          this.gapAheadText.visible = true;
        }
      }
    }

    // 2. Connector to car behind
    if (selPos < n - 1) {
      const behindIdx = snapshot.orderByPosition[selPos + 1];
      if (behindIdx < n && snapshot.status[behindIdx] === 0) {
        camera.worldToScreen(snapshot.x[behindIdx], snapshot.y[behindIdx], this.ptBehind);

        this.graphics
          .moveTo(this.ptSel.x, this.ptSel.y)
          .lineTo(this.ptBehind.x, this.ptBehind.y)
          .stroke({ width: 1.5, color: canvasPalette.text3, alpha: 0.55 });

        const midX = (this.ptSel.x + this.ptBehind.x) / 2;
        const midY = (this.ptSel.y + this.ptBehind.y) / 2;

        const gapSec = snapshot.gapAhead[behindIdx];
        const gapStr = this.formatGap(gapSec);
        if (gapStr) {
          this.graphics
            .roundRect(midX - 22, midY - 8, 44, 16, 3)
            .fill({ color: canvasPalette.labelBg, alpha: 0.92 })
            .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.85 });

          this.gapBehindText.text = gapStr;
          this.gapBehindText.x = midX;
          this.gapBehindText.y = midY;
          this.gapBehindText.visible = true;
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
