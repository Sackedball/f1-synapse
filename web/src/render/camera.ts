export type CameraMode = 'fit' | 'free' | 'follow';

export interface CameraBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export class Camera {
  // Current interpolated values
  x = 0;
  y = 0;
  zoom = 1;
  rotation = 0; // In radians

  // Targets for smooth damping
  targetX = 0;
  targetY = 0;
  targetZoom = 1;
  targetRotation = 0;

  viewportWidth = 800;
  viewportHeight = 600;

  mode: CameraMode = 'fit';
  bounds: CameraBounds | null = null;
  padding = 48;

  // Clamps
  minZoom = 0.005;
  maxZoom = 2.0;
  fitZoom = 1;

  // Follow target
  followTarget: Point2D | null = null;
  followZoomFactor = 2.6; // Multiplier of fit zoom when following

  // Damping factor for smooth interpolation (10 = ~300ms ease-out)
  damping = 10;

  // Preallocated output vector to prevent GC pressure
  private _scratchPoint: Point2D = { x: 0, y: 0 };

  constructor(width = 800, height = 600) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  setViewport(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (this.mode === 'fit' && this.bounds) {
      this.recalculateFit(true);
    }
  }

  setBounds(bounds: CameraBounds, broadcastRotationDeg = 0): void {
    this.bounds = bounds;
    this.targetRotation = (broadcastRotationDeg * Math.PI) / 180;
    this.rotation = this.targetRotation;
    this.recalculateFit(true);
  }

  setRotation(rad: number, immediate = false): void {
    this.targetRotation = rad;
    if (immediate) this.rotation = rad;
  }

  setNorthUp(northUp: boolean, broadcastRotationDeg = 0, immediate = false): void {
    const rad = northUp ? 0 : (broadcastRotationDeg * Math.PI) / 180;
    this.setRotation(rad, immediate);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === 'fit') {
      this.recalculateFit(false);
    }
  }

  setFollowTarget(wx: number, wy: number): void {
    if (!this.followTarget) {
      this.followTarget = { x: wx, y: wy };
    } else {
      this.followTarget.x = wx;
      this.followTarget.y = wy;
    }
  }

  clearFollowTarget(): void {
    this.followTarget = null;
  }

  recalculateFit(immediate = false): void {
    if (!this.bounds) return;

    const { minX, minY, maxX, maxY } = this.bounds;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const trackW = Math.max(1, maxX - minX);
    const trackH = Math.max(1, maxY - minY);

    // Calculate rotated extent
    const theta = this.targetRotation;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));

    const rotatedW = trackW * cos + trackH * sin;
    const rotatedH = trackW * sin + trackH * cos;

    const availW = Math.max(50, this.viewportWidth - this.padding * 2);
    const availH = Math.max(50, this.viewportHeight - this.padding * 2);

    const calculatedZoom = Math.min(availW / rotatedW, availH / rotatedH);
    this.fitZoom = Math.max(this.minZoom, calculatedZoom);

    this.targetX = cx;
    this.targetY = cy;
    this.targetZoom = this.fitZoom;

    if (immediate) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
      this.rotation = this.targetRotation;
    }
  }

  resetToFit(): void {
    this.mode = 'fit';
    this.recalculateFit(false);
  }

  panByScreenDelta(dsx: number, dsy: number): void {
    this.mode = 'free';
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    const dcx = -(dsx * cos + dsy * sin) / this.zoom;
    const dcy = (-dsx * sin + dsy * cos) / this.zoom;

    this.x += dcx;
    this.y += dcy;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  zoomAtScreenPoint(factor: number, sx: number, sy: number): void {
    this.mode = 'free';
    const oldZoom = this.zoom;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 1e-7) return;

    const deltaX = sx - this.viewportWidth / 2;
    const deltaY = sy - this.viewportHeight / 2;

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    const deltaInvZoom = 1 / oldZoom - 1 / newZoom;
    const dcx = (deltaX * cos + deltaY * sin) * deltaInvZoom;
    const dcy = (deltaX * sin - deltaY * cos) * deltaInvZoom;

    this.x += dcx;
    this.y += dcy;
    this.zoom = newZoom;
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetZoom = this.zoom;
  }

  zoomIn(): void {
    this.zoomAtScreenPoint(1.25, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  zoomOut(): void {
    this.zoomAtScreenPoint(0.8, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  worldToScreen(wx: number, wy: number, out?: Point2D): Point2D {
    const res = out || this._scratchPoint;
    const dx = wx - this.x;
    const dy = wy - this.y;

    const unrotX = dx * this.zoom;
    const unrotY = -dy * this.zoom;

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    res.x = this.viewportWidth / 2 + (unrotX * cos - unrotY * sin);
    res.y = this.viewportHeight / 2 + (unrotX * sin + unrotY * cos);
    return res;
  }

  screenToWorld(sx: number, sy: number, out?: Point2D): Point2D {
    const res = out || this._scratchPoint;
    const rotX = sx - this.viewportWidth / 2;
    const rotY = sy - this.viewportHeight / 2;

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    const unrotX = rotX * cos + rotY * sin;
    const unrotY = -rotX * sin + rotY * cos;

    res.x = this.x + unrotX / this.zoom;
    res.y = this.y - unrotY / this.zoom;
    return res;
  }

  /**
   * Calculates car heading on screen given motion vector.
   * Motion vector (dx, dy) in world coords:
   * Returns screen angle in radians where 0 is Right, PI/2 is Down.
   */
  calculateScreenHeading(dx: number, dy: number): number {
    if (dx * dx + dy * dy < 1e-8) return 0;
    const worldAngle = Math.atan2(dy, dx);
    return -worldAngle + this.rotation;
  }

  update(dtSec = 1 / 60): void {
    if (this.mode === 'fit') {
      if (this.bounds) {
        this.recalculateFit(false);
      }
    } else if (this.mode === 'follow' && this.followTarget) {
      this.targetX = this.followTarget.x;
      this.targetY = this.followTarget.y;
      this.targetZoom = Math.min(this.maxZoom, this.fitZoom * this.followZoomFactor);
    }

    // Damped lerp toward targets
    const alpha = 1 - Math.exp(-this.damping * dtSec);

    this.x += (this.targetX - this.x) * alpha;
    this.y += (this.targetY - this.y) * alpha;
    this.zoom += (this.targetZoom - this.zoom) * alpha;
    this.rotation += (this.targetRotation - this.rotation) * alpha;
  }
}
