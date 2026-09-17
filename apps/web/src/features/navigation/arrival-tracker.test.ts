import { describe, expect, it, vi } from "vitest";

const modulePath = "./arrival-tracker.js";
type Point = { latitude: number; longitude: number };
type State =
  | {
      status:
        "idle" | "requesting" | "cancelled" | "arrived" | "already-nearby";
    }
  | { status: "active"; distanceMeters: number; arrivalUncertain?: boolean }
  | { status: "denied" | "timeout" | "unavailable" | "unsupported" };
type Position = { coords: Point & { accuracy: number } };
type Geo = {
  watchPosition: (
    success: (position: Position) => void,
    error: (error: { code: number }) => void,
  ) => number;
  clearWatch: (id: number) => void;
};
type Tracker = { start: () => void; cancel: () => void; dispose: () => void };
type TrackerModule = {
  createArrivalTracker: (options: {
    geolocation?: Geo;
    destination: Point;
    radiusMeters?: number;
    onState: (state: State) => void;
    onPosition?: (position: Point | null) => void;
    onStart?: () => void;
    onArrival?: () => void;
    onAlreadyNearby?: () => void;
  }) => Tracker;
};

async function subject(): Promise<TrackerModule> {
  return (await import(modulePath)) as TrackerModule;
}

function createGeo() {
  const callbacks: {
    success?: (position: Position) => void;
    error?: (error: { code: number }) => void;
  } = {};
  const geo: Geo = {
    watchPosition: vi.fn(
      (
        success: (position: Position) => void,
        error: (error: { code: number }) => void,
      ) => {
        callbacks.success = success;
        callbacks.error = error;
        return 7;
      },
    ),
    clearWatch: vi.fn(),
  };
  return { geo, callbacks };
}

const destination = { latitude: -4.2636, longitude: 15.2429 };
const fix = (point: Point, accuracy = 5): Position => ({
  coords: { ...point, accuracy },
});

describe("explicit arrival watch lifecycle", () => {
  it("does not watch before start, reports only derived distance, and arrives once", async () => {
    const { createArrivalTracker } = await subject();
    const { geo, callbacks } = createGeo();
    const states: State[] = [];
    const positions: (Point | null)[] = [];
    const tracker = createArrivalTracker({
      geolocation: geo,
      destination,
      onState: (state) => states.push(state),
      onPosition: (position) => positions.push(position),
    });
    expect(geo.watchPosition).not.toHaveBeenCalled();
    tracker.start();
    expect(states.at(-1)).toEqual({ status: "requesting" });
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    callbacks.success?.(fix({ latitude: -4.2646, longitude: 15.2429 }));
    expect(states.at(-1)?.status).toBe("active");
    expect(states.at(-1)).not.toHaveProperty("coordinates");
    callbacks.success?.(fix(destination));
    expect(states.at(-1)).toEqual({ status: "arrived" });
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    expect(positions.at(-1)).toBeNull();
    callbacks.success?.(fix(destination));
    expect(states.filter((state) => state.status === "arrived")).toHaveLength(
      1,
    );
    expect(geo.clearWatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)(
    "maps error %i to %s and clears the watcher",
    async (code, status) => {
      const { createArrivalTracker } = await subject();
      const { geo, callbacks } = createGeo();
      const states: State[] = [];
      const tracker = createArrivalTracker({
        geolocation: geo,
        destination,
        onState: (state) => states.push(state),
      });
      tracker.start();
      callbacks.error?.({ code });
      expect(states.at(-1)).toEqual({ status });
      expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    },
  );

  it("handles unsupported, thrown and invalid-position failures", async () => {
    const { createArrivalTracker } = await subject();
    const states: State[] = [];
    createArrivalTracker({
      destination,
      onState: (state) => states.push(state),
    }).start();
    expect(states.at(-1)).toEqual({ status: "unsupported" });
    const tracker = createArrivalTracker({
      geolocation: {
        watchPosition: () => {
          throw new Error("failure");
        },
        clearWatch: vi.fn(),
      },
      destination,
      onState: (state) => states.push(state),
    });
    tracker.start();
    expect(states.at(-1)).toEqual({ status: "unavailable" });
    const { geo, callbacks } = createGeo();
    createArrivalTracker({
      geolocation: geo,
      destination,
      onState: (state) => states.push(state),
    }).start();
    callbacks.success?.(fix({ latitude: Number.NaN, longitude: 15 }));
    expect(states.at(-1)).toEqual({ status: "unavailable" });
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("cancel and dispose clear the watcher and ignore late callbacks", async () => {
    const { createArrivalTracker } = await subject();
    const { geo, callbacks } = createGeo();
    const states: State[] = [];
    const tracker = createArrivalTracker({
      geolocation: geo,
      destination,
      onState: (state) => states.push(state),
    });
    tracker.start();
    tracker.cancel();
    expect(states.at(-1)).toEqual({ status: "cancelled" });
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    callbacks.success?.(fix(destination));
    expect(states.at(-1)).toEqual({ status: "cancelled" });
    tracker.start();
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    tracker.dispose();
    expect(geo.clearWatch).toHaveBeenCalledTimes(2);
    const stateCount = states.length;
    callbacks.success?.(fix(destination));
    expect(states).toHaveLength(stateCount);
  });

  it("emits one arrival callback only after crossing a configurable radius", async () => {
    const { createArrivalTracker } = await subject();
    const { geo, callbacks } = createGeo();
    const onArrival = vi.fn();
    const tracker = createArrivalTracker({
      geolocation: geo,
      destination,
      radiusMeters: 75,
      onState: vi.fn(),
      onArrival,
    });
    tracker.start();
    callbacks.success?.(fix({ latitude: -4.2646, longitude: 15.2429 }));
    expect(onArrival).not.toHaveBeenCalled();
    callbacks.success?.(fix({ latitude: -4.26415, longitude: 15.2429 }));
    callbacks.success?.(fix(destination));
    expect(onArrival).toHaveBeenCalledTimes(1);
    tracker.dispose();
  });

  it("treats an imprecise near fix followed by a reliable near fix as already nearby", async () => {
    const { createArrivalTracker } = await subject();
    const { geo, callbacks } = createGeo();
    const states: State[] = [];
    const onArrival = vi.fn();
    const onAlreadyNearby = vi.fn();
    createArrivalTracker({
      geolocation: geo,
      destination,
      onState: (state) => states.push(state),
      onArrival,
      onAlreadyNearby,
    }).start();
    callbacks.success?.(fix(destination, 1000));
    expect(states.at(-1)).toMatchObject({
      status: "active",
      arrivalUncertain: true,
    });
    expect(onArrival).not.toHaveBeenCalled();
    expect(geo.clearWatch).not.toHaveBeenCalled();
    callbacks.success?.(fix(destination, 50));
    expect(states.at(-1)).toEqual({ status: "already-nearby" });
    expect(onAlreadyNearby).toHaveBeenCalledTimes(1);
    expect(onArrival).not.toHaveBeenCalled();
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("fails closed on invalid accuracy without stopping the watcher", async () => {
    const { createArrivalTracker } = await subject();
    const { geo, callbacks } = createGeo();
    const states: State[] = [];
    const onArrival = vi.fn();
    createArrivalTracker({
      geolocation: geo,
      destination,
      onState: (state) => states.push(state),
      onArrival,
    }).start();
    for (const accuracy of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      callbacks.success?.(fix(destination, accuracy));
      expect(states.at(-1)).toMatchObject({
        status: "active",
        arrivalUncertain: true,
      });
      expect(onArrival).not.toHaveBeenCalled();
      expect(geo.clearWatch).not.toHaveBeenCalled();
    }
  });

  it("marks a synchronous near fix as already nearby and never starts without API support", async () => {
    const { createArrivalTracker } = await subject();
    const events: string[] = [];
    const clearWatch = vi.fn();
    const tracker = createArrivalTracker({
      geolocation: {
        watchPosition(success) {
          success(fix(destination));
          return 7;
        },
        clearWatch,
      },
      destination,
      onState: vi.fn(),
      onStart: () => events.push("route_started"),
      onArrival: () => events.push("arrival_confirmed"),
      onAlreadyNearby: () => events.push("already_nearby"),
    });
    tracker.start();
    expect(events).toEqual(["route_started", "already_nearby"]);
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    tracker.start();
    expect(events).toEqual([
      "route_started",
      "already_nearby",
      "route_started",
      "already_nearby",
    ]);
    const unsupportedEvents: string[] = [];
    createArrivalTracker({
      destination,
      onState: vi.fn(),
      onStart: () => unsupportedEvents.push("route_started"),
      onArrival: () => unsupportedEvents.push("arrival_confirmed"),
    }).start();
    expect(unsupportedEvents).toEqual([]);
  });

  it("does not emit a second start event while a watcher is active", async () => {
    const { createArrivalTracker } = await subject();
    const { geo } = createGeo();
    const onStart = vi.fn();
    const tracker = createArrivalTracker({
      geolocation: geo,
      destination,
      onState: vi.fn(),
      onStart,
    });
    tracker.start();
    tracker.start();
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    tracker.cancel();
  });
});
