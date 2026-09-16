import { useEffect, useRef, useState } from "react";
import type { AdminPharmacy } from "@wanzila/contracts";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";

export function DutyLocationMap({ pharmacy }: { pharmacy: AdminPharmacy }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const { latitude, longitude } = pharmacy.coordinates;

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    setStatus("loading");
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        maplibre.setWorkerUrl(mapWorkerUrl);
        const map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl,
          center: [longitude, latitude],
          zoom: 14,
          attributionControl: false,
        });
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-left",
        );
        map.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        map.once("load", () => setStatus("ready"));
        map.on("error", () => setStatus("error"));
        mapRef.current = map;
        const pin = document.createElement("span");
        pin.className = "admin-duty-map__pin";
        pin.setAttribute("aria-hidden", "true");
        markerRef.current = new maplibre.Marker({
          element: pin,
          anchor: "bottom",
        })
          .setLngLat([longitude, latitude])
          .addTo(map);
        observer = new ResizeObserver(() => map.resize());
        observer.observe(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  return (
    <div className="admin-duty-map">
      <div
        aria-label={`Carte de localisation de ${pharmacy.name}`}
        className="admin-duty-map__canvas"
        data-map-status={status}
        ref={containerRef}
        role="region"
      />
      {status === "loading" ? (
        <p className="admin-duty-map__notice" role="status">
          Chargement de la carte…
        </p>
      ) : null}
      {status === "error" ? (
        <p className="admin-duty-map__notice" role="status">
          Carte indisponible. L’adresse reste accessible ci-dessous.
        </p>
      ) : null}
    </div>
  );
}
