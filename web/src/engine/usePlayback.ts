import { useSyncExternalStore, useRef, useMemo } from 'react';
import { PlaybackClock, PlaybackStatus } from './PlaybackClock';
import { FrameStore } from './FrameStore';
import { Snapshot, createSnapshot } from './snapshot';

/**
 * Hook to subscribe to playback status changes only (rare updates: playing/paused/buffering/ended).
 * Does not re-render on playhead motion.
 */
export function usePlaybackStatus(clock: PlaybackClock | null): PlaybackStatus {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!clock) return () => {};
      let lastStatus = clock.status;
      return clock.subscribe((_t, status) => {
        if (status !== lastStatus) {
          lastStatus = status;
          onStoreChange();
        }
      });
    },
    () => clock?.status ?? 'paused',
    () => 'paused',
  );
}

/**
 * Hook to subscribe to current playhead time throttled to hz (default: 10 Hz).
 * Ensures React components update at 10 Hz instead of 60 Hz.
 */
export function usePlayhead(clock: PlaybackClock | null, hz: number = 10): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!clock) return () => {};
      return clock.subscribeThrottled(() => {
        onStoreChange();
      }, hz);
    },
    () => clock?.raceTime ?? 0,
    () => 0,
  );
}

/**
 * Hook to sample the FrameStore and select specific derived values at a throttled rate (hz).
 * Re-renders only when selector result changes (uses value equality check).
 */
export function useSnapshotSelector<T>(
  clock: PlaybackClock | null,
  store: FrameStore | null,
  selector: (snapshot: Snapshot) => T,
  driverCount: number = 20,
  hz: number = 10,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  // Preallocate private snapshot for this hook instance
  const snapshotRef = useRef<Snapshot | null>(null);
  if (!snapshotRef.current || snapshotRef.current.n !== driverCount) {
    snapshotRef.current = createSnapshot(driverCount);
  }

  const lastValueRef = useRef<T | undefined>(undefined);

  const getSnapshotValue = () => {
    if (!clock || !store || !snapshotRef.current) {
      // Empty sample
      return selector(snapshotRef.current ?? createSnapshot(driverCount));
    }
    store.sample(clock.raceTime, snapshotRef.current);
    const newValue = selector(snapshotRef.current);
    if (lastValueRef.current === undefined || !isEqual(lastValueRef.current, newValue)) {
      lastValueRef.current = newValue;
    }
    return lastValueRef.current;
  };

  const subscribe = useMemo(() => {
    return (onStoreChange: () => void) => {
      if (!clock) return () => {};
      return clock.subscribeThrottled(() => {
        onStoreChange();
      }, hz);
    };
  }, [clock, hz]);

  return useSyncExternalStore(
    subscribe,
    getSnapshotValue,
    getSnapshotValue,
  );
}
