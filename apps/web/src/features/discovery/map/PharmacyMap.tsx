import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePublicPharmacy } from "@wanzila/contracts";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { toPharmacyFeatures } from "./pharmacy-map-features";

type MapStatus = "loading" | "ready" | "error";

const initialCenter: [longitude: number, latitude: number] = [15.255, -4.275];
const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";

export function PharmacyMap({
  pharmacies,
  selectedId,
  onSelect,
}: {
  pharmacies: readonly ActivePublicPharmacy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerConstructorRef = useRef<typeof MapLibreMarker | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapVersion, setMapVersion] = useState(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const features = useMemo(() => toPharmacyFeatures(pharmacies), [pharmacies]);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        maplibre.setWorkerUrl(mapWorkerUrl);
        const map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl,
          center: initialCenter,
          zoom: 12.8,
          attributionControl: false,
        });
        map.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        map.once("load", () => setStatus("ready"));
        map.on("error", (event) => {
          console.error("MapLibre error", event.error);
          setStatus("error");
        });
        mapRef.current = map;
        markerConstructorRef.current = maplibre.Marker;
        observer = new ResizeObserver(() => map.resize());
        observer.observe(containerRef.current);
        setMapVersion((version) => version + 1);
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
      markerConstructorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerConstructorRef.current;
    if (!map || !Marker || mapVersion === 0) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = features.features.map((feature) => {
      const button = document.createElement("button");
      const pin = document.createElement("span");
      const cross = document.createElement("span");
      button.type = "button";
      button.className =
        feature.properties.id === selectedId
          ? "pharmacy-map-marker pharmacy-map-marker--selected"
          : "pharmacy-map-marker";
      button.setAttribute(
        "aria-label",
        `${feature.properties.name} sur la carte`,
      );
      button.setAttribute(
        "aria-pressed",
        String(feature.properties.id === selectedId),
      );
      pin.className = "pharmacy-map-marker__pin";
      cross.className = "pharmacy-map-marker__cross";
      cross.setAttribute("aria-hidden", "true");
      cross.textContent = "+";
      pin.append(cross);
      button.append(pin);
      if (feature.properties.id === selectedId) {
        const label = document.createElement("span");
        label.className = "pharmacy-map-marker__label";
        label.textContent = feature.properties.name;
        button.append(label);
      }
      button.addEventListener("click", () => onSelect(feature.properties.id));
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat(feature.geometry.coordinates)
        .addTo(map);
    });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [features, mapVersion, onSelect, selectedId]);

  return (
    <>
      <div
        aria-label="Carte interactive de Brazzaville"
        className="pharmacy-map__canvas"
        data-map-status={status}
        ref={containerRef}
      />
      {status === "error" ? (
        <p className="pharmacy-map__notice" role="status">
          Fond de carte indisponible. Les pharmacies restent accessibles en
          liste.
        </p>
      ) : null}
    </>
  );
}
