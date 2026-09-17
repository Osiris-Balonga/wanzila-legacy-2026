export type ArrivalCoordinates = { latitude: number; longitude: number };

const earthRadiusMeters = 6_371_000;
export const DEFAULT_ARRIVAL_RADIUS_METERS = 50;

function valid(point: ArrivalCoordinates): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

/** Geodesic proximity only; never a road route or remaining travel distance. */
export function straightLineDistanceMeters(
  from: ArrivalCoordinates,
  to: ArrivalCoordinates,
): number | null {
  if (!valid(from) || !valid(to)) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from.latitude * radians) *
      Math.cos(to.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isWithinArrivalRadius(
  distanceMeters: number | null,
  radiusMeters = DEFAULT_ARRIVAL_RADIUS_METERS,
): boolean {
  return (
    distanceMeters !== null &&
    Number.isFinite(distanceMeters) &&
    distanceMeters >= 0 &&
    Number.isFinite(radiusMeters) &&
    radiusMeters > 0 &&
    distanceMeters <= radiusMeters
  );
}

/** Conservative GPS estimate: the entire accuracy radius must fit inside the arrival radius. */
export function isArrivalCertain(
  distanceMeters: number | null,
  accuracyMeters: number,
  radiusMeters = DEFAULT_ARRIVAL_RADIUS_METERS,
): boolean {
  return (
    isWithinArrivalRadius(distanceMeters, radiusMeters) &&
    Number.isFinite(accuracyMeters) &&
    accuracyMeters >= 0 &&
    distanceMeters !== null &&
    distanceMeters + accuracyMeters <= radiusMeters
  );
}
