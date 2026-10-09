import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { TrackGeometry } from '@/api/types';
import { canvasPalette } from '../palette';

export class CornersLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly textContainer: Container;
  private pt: Point2D = { x: 0, y: 0 };
  private labels: Text[] = [];

  private textStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 9,
    fontWeight: 'bold',
    fill: canvasPalette.text2,
  });

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.textContainer = new Container();

    this.container.addChild(this.graphics);
    this.container.addChild(this.textContainer);
  }

  render(camera: Camera, track: TrackGeometry | null): void {
    this.graphics.clear();
    const corners = track?.corners;

    // Hide corner labels when zoomed far out to keep view uncluttered
    const isZoomedIn = camera.zoom > camera.fitZoom * 1.15;
    if (!corners || corners.length === 0 || !isZoomedIn) {
      this.textContainer.visible = false;
      return;
    }

    this.textContainer.visible = true;

    // Ensure we have enough Text objects
    while (this.labels.length < corners.length) {
      const txt = new Text({ text: '', style: this.textStyle });
      txt.anchor.set(0.5);
      this.labels.push(txt);
      this.textContainer.addChild(txt);
    }

    // Hide extra texts
    for (let i = corners.length; i < this.labels.length; i++) {
      this.labels[i].visible = false;
    }

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      camera.worldToScreen(corner.x, corner.y, this.pt);

      const w = 18;
      const h = 14;
      this.graphics
        .roundRect(this.pt.x - w / 2, this.pt.y - h / 2, w, h, 4)
        .fill({ color: canvasPalette.surface2, alpha: 0.92 })
        .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.85 });

      const label = this.labels[i];
      label.text = String(corner.number);
      label.x = this.pt.x;
      label.y = this.pt.y;
      label.visible = true;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
