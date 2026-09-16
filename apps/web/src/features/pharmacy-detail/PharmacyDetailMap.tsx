import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";

export function hasValidCoordinates(
  coordinates: { latitude: number; longitude: number } | undefined,
): coordinates is { latitude: number; longitude: number } {
  return Boolean(
    coordinates &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    Math.abs(coordinates.latitude) <= 90 &&
    Math.abs(coordinates.longitude) <= 180,
  );
}

export function PharmacyDetailMap({
  coordinates,
  name,
}: {
  coordinates: { latitude: number; longitude: number };
  name: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let marker: MapLibreMarker | undefined;
    let observer: ResizeObserver | undefined;
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        maplibre.setWorkerUrl(mapWorkerUrl);
        map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl,
          center: [coordinates.longitude, coordinates.latitude],
          zoom: 14.5,
          attributionControl: false,
          interactive: false,
        });
        map.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        map.once("load", () => {
          map?.easeTo({
            center: [coordinates.longitude, coordinates.latitude],
            offset: [0, 55],
            duration: 0,
          });
          setStatus("ready");
        });
        map.on("error", () => setStatus("error"));
        const markerElement = document.createElement("div");
        markerElement.className = "pharmacy-detail-map__marker";
        const pin = document.createElement("span");
        pin.className = "pharmacy-detail-map__pin";
        pin.setAttribute("aria-hidden", "true");
        const cross = document.createElement("span");
        cross.className = "pharmacy-detail-map__cross";
        cross.textContent = "+";
        pin.append(cross);
        const label = document.createElement("span");
        label.className = "pharmacy-detail-map__label";
        label.textContent = name;
        markerElement.append(pin, label);
        marker = new maplibre.Marker({
          element: markerElement,
          anchor: "bottom",
        })
          .setLngLat([coordinates.longitude, coordinates.latitude])
          .addTo(map);
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      marker?.remove();
      map?.remove();
    };
  }, [coordinates.latitude, coordinates.longitude, name]);

  return (
    <section
      className="pharmacy-detail-map"
      aria-label={`Carte indiquant ${name}`}
    >
      <div
        className="pharmacy-detail-map__canvas"
        data-map-status={status}
        ref={containerRef}
      />
      {status === "error" ? (
        <p className="pharmacy-detail-map__notice" role="status">
          Fond de carte indisponible. L’adresse et les coordonnées restent
          accessibles ci-dessous.
        </p>
      ) : null}
    </section>
  );
}
