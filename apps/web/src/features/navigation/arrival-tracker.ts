import {
  DEFAULT_ARRIVAL_RADIUS_METERS,
  isWithinArrivalRadius,
  straightLineDistanceMeters,
  type ArrivalCoordinates,
} from "@wanzila/domain";

export type ArrivalState =
  | { status: "idle" | "requesting" | "cancelled" | "arrived" }
  | { status: "active"; distanceMeters: number }
  | { status: "denied" | "timeout" | "unavailable" | "unsupported" };

type ArrivalGeolocation = Pick<Geolocation, "watchPosition" | "clearWatch">;

export function createArrivalTracker({
  geolocation,
  destination,
  radiusMeters = DEFAULT_ARRIVAL_RADIUS_METERS,
  onState,
  onPosition,
  onArrival,
}: {
  geolocation?: ArrivalGeolocation;
  destination: ArrivalCoordinates;
  radiusMeters?: number;
  onState: (state: ArrivalState) => void;
  onPosition?: (position: ArrivalCoordinates | null) => void;
  onArrival?: () => void;
}) {
  let watchId: number | null = null;
  let generation = 0;
  let watching = false;
  let disposed = false;

  function stop(notifyPosition = true) {
    watching = false;
    generation += 1;
    if (watchId !== null) {
      geolocation?.clearWatch(watchId);
      watchId = null;
    }
    if (notifyPosition) onPosition?.(null);
  }

  function fail(status: "denied" | "timeout" | "unavailable") {
    stop();
    onState({ status });
  }

  return {
    start() {
      if (disposed || watching) return false;
      onPosition?.(null);
      if (!geolocation) {
        onState({ status: "unsupported" });
        return true;
      }
      const attempt = ++generation;
      watching = true;
      onState({ status: "requesting" });
      try {
        const id = geolocation.watchPosition(
          (position) => {
            if (disposed || !watching || attempt !== generation) return;
            const current = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            const distanceMeters = straightLineDistanceMeters(
              current,
              destination,
            );
            if (distanceMeters === null) {
              fail("unavailable");
              return;
            }
            if (isWithinArrivalRadius(distanceMeters, radiusMeters)) {
              stop();
              onArrival?.();
              onState({ status: "arrived" });
              return;
            }
            // Only the current fix is held transiently for the existing map marker.
            onPosition?.(current);
            onState({ status: "active", distanceMeters });
          },
          (error) => {
            if (disposed || !watching || attempt !== generation) return;
            fail(
              error.code === 1
                ? "denied"
                : error.code === 3
                  ? "timeout"
                  : "unavailable",
            );
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
        );
        // A deterministic test implementation may call back synchronously.
        if (disposed || !watching || attempt !== generation) {
          geolocation.clearWatch(id);
        } else {
          watchId = id;
        }
      } catch {
        if (!disposed && watching && attempt === generation)
          fail("unavailable");
      }
      return true;
    },
    cancel() {
      if (disposed) return;
      stop();
      onState({ status: "cancelled" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop(false);
    },
  };
}
