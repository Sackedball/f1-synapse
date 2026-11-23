import { isDemoMode, isFixtureMode, getFixtureName, fetchMaybeGzip } from './client';
import { ApiError } from './types';

export async function fetchChunk(
  sid: string,
  k: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (isDemoMode()) {
    // Static hosting: chunks are pre-exported and gzipped (scripts/export_static_demo.py).
    return fetchMaybeGzip(`/demo/${encodeURIComponent(sid)}/chunk_${k}.bin.gz`, signal);
  }

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
