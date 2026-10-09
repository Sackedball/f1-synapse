import { isFixtureMode, getFixtureName } from './client';
import { ApiError } from './types';

export async function fetchChunk(
  sid: string,
  k: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  let url = `/api/sessions/${encodeURIComponent(sid)}/frames/${k}`;
  if (isFixtureMode()) {
    const fixture = getFixtureName();
    url = `/fixtures/${fixture}/chunk_${k}.bin`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to load chunk ${k}`);
  }
  return res.arrayBuffer();
}
