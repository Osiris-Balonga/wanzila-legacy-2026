type MapPharmacy = {
  id: string;
  name: string;
  coordinates?: { latitude: number; longitude: number };
};

export type PharmacyPointFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [longitude: number, latitude: number];
  };
  properties: { id: string; name: string };
};

export type PharmacyFeatureCollection = {
  type: "FeatureCollection";
  features: PharmacyPointFeature[];
};

export function toPharmacyFeatures(
  pharmacies: readonly MapPharmacy[],
): PharmacyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: pharmacies.flatMap((pharmacy) => {
      const point = pharmacy.coordinates;
      if (
        !point ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        Math.abs(point.latitude) > 90 ||
        Math.abs(point.longitude) > 180
      ) {
        return [];
      }
      return [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [point.longitude, point.latitude] as [number, number],
          },
          properties: { id: pharmacy.id, name: pharmacy.name },
        },
      ];
    }),
  };
}
