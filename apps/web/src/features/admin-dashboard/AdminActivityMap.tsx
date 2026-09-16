import type { AdminAnalyticsOverviewResponse } from "@wanzila/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

type Pharmacy = AdminAnalyticsOverviewResponse["data"]["topPharmacies"][number];
type LocatedPharmacy = Pharmacy & {
  coordinates: NonNullable<Pharmacy["coordinates"]>;
};
const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";

export function AdminActivityMap({ pharmacies }: { pharmacies: Pharmacy[] }) {
  const points = useMemo(
    () =>
      pharmacies.filter(
        (pharmacy): pharmacy is LocatedPharmacy =>
          pharmacy.coordinates !== null,
      ),
    [pharmacies],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (points.length === 0) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    setStatus("loading");
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        maplibre.setWorkerUrl(mapWorkerUrl);
        const longitude =
          points.reduce((sum, point) => sum + point.coordinates.longitude, 0) /
          points.length;
        const latitude =
          points.reduce((sum, point) => sum + point.coordinates.latitude, 0) /
          points.length;
        const map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl,
          center: [longitude, latitude],
          zoom: 11.6,
          attributionControl: false,
        });
        map.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        map.once("load", () => setStatus("ready"));
        map.on("error", () => setStatus("error"));
        mapRef.current = map;
        markersRef.current = points.map((pharmacy) => {
          const label = pharmacy.name ?? "Pharmacie sans nom";
          const marker = document.createElement("div");
          marker.className = "analytics-map-marker";
          marker.setAttribute("aria-hidden", "true");
          marker.title = label;
          return new maplibre.Marker({
            element: marker,
            anchor: "center",
          })
            .setLngLat([
              pharmacy.coordinates.longitude,
              pharmacy.coordinates.latitude,
            ])
            .addTo(map);
        });
        observer = new ResizeObserver(() => map.resize());
        observer.observe(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="analytics-map-empty" role="status">
        Aucune coordonnée disponible parmi les pharmacies les plus consultées.
      </p>
    );
  }

  return (
    <div className="analytics-map">
      <div
        aria-label="Points géocodés des pharmacies les plus consultées"
        className="analytics-map__canvas"
        data-map-status={status}
        ref={containerRef}
      />
      {status === "loading" ? (
        <p className="analytics-map__notice" role="status">
          Chargement de la carte…
        </p>
      ) : null}
      {status === "error" ? (
        <p className="analytics-map__notice" role="status">
          Fond de carte indisponible. Les pharmacies représentées restent
          listées ci-dessous.
        </p>
      ) : null}
      <ul className="analytics-map__legend">
        {points.map((pharmacy) => (
          <li key={pharmacy.pharmacyId}>
            {pharmacy.name ?? "Pharmacie sans nom"}
          </li>
        ))}
      </ul>
    </div>
  );
}
