import html2canvas from 'html2canvas';

export interface ExportSnapshotOptions {
  scale?: 1 | 2;
  eventName?: string;
  lap?: number;
  timeSeconds?: number;
}

/**
 * Composites the race workspace DOM and PixiJS WebGL canvas into a high-res PNG
 */
export async function captureWorkspace(options: ExportSnapshotOptions = {}): Promise<Blob> {
  const scale = options.scale || 1;
  const workspaceEl =
    document.getElementById('race-workspace-root') ||
    (document.querySelector('.race-workspace') as HTMLElement) ||
    document.body;

  // 1. Capture DOM elements via html2canvas
  const domCanvas = await html2canvas(workspaceEl, {
    backgroundColor: '#08080c',
    scale,
    logging: false,
    useCORS: true,
  });

  // 2. Locate the WebGL canvas element inside the workspace
  const webglCanvas = workspaceEl.querySelector('canvas') as HTMLCanvasElement | null;
  if (webglCanvas && webglCanvas.width > 0 && webglCanvas.height > 0) {
    const wsRect = workspaceEl.getBoundingClientRect();
    const canvasRect = webglCanvas.getBoundingClientRect();

    const destX = (canvasRect.left - wsRect.left) * scale;
    const destY = (canvasRect.top - wsRect.top) * scale;
    const destW = canvasRect.width * scale;
    const destH = canvasRect.height * scale;

    const ctx = domCanvas.getContext('2d');
    if (ctx) {
      // Draw the active WebGL canvas frame on top of any blank area
      ctx.drawImage(webglCanvas, destX, destY, destW, destH);
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    domCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate image Blob from composite canvas'));
        }
      },
      'image/png',
      0.95,
    );
  });
}

/**
 * Triggers a download of the captured race workspace PNG with formatted filename
 */
export async function downloadWorkspaceSnapshot(options: ExportSnapshotOptions = {}): Promise<string> {
  const blob = await captureWorkspace(options);
  const eventName = (options.eventName || 'replay').replace(/[^a-zA-Z0-9_-]/g, '_');
  const lap = options.lap !== undefined ? `lap${options.lap}` : 'live';
  const timeSec = Math.floor(options.timeSeconds ?? 0);
  const mm = Math.floor(timeSec / 60);
  const ss = String(timeSec % 60).padStart(2, '0');
  const filename = `f1synapse_${eventName}_${lap}_${mm}m${ss}s.png`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}
