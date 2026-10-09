import { Container, Graphics } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { TrackGeometry } from '@/api/types';
import { canvasPalette } from '../palette';

export class MiniSectorsLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private pt1: Point2D = { x: 0, y: 0 };
  private pt2: Point2D = { x: 0, y: 0 };

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  render(camera: Camera, track: TrackGeometry | null): void {
    this.graphics.clear();
    if (!track || !track.sectors || track.sectors.length === 0) return;
    const { inner, outer } = track;
    if (!inner || !outer) return;

    for (const sectorIdx of track.sectors) {
      if (sectorIdx >= 0 && sectorIdx < inner.length && sectorIdx < outer.length) {
        camera.worldToScreen(inner[sectorIdx][0], inner[sectorIdx][1], this.pt1);
        camera.worldToScreen(outer[sectorIdx][0], outer[sectorIdx][1], this.pt2);

        this.graphics
          .moveTo(this.pt1.x, this.pt1.y)
          .lineTo(this.pt2.x, this.pt2.y)
          .stroke({ width: 1.5, color: canvasPalette.text3, alpha: 0.5 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
