import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { RouteLineFeature } from "../navigation/route-preview";

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
  origin,
  route,
}: {
  coordinates: { latitude: number; longitude: number };
  name: string;
  origin?: { latitude: number; longitude: number } | null;
  route?: RouteLineFeature | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let marker: MapLibreMarker | undefined;
    let originMarker: MapLibreMarker | undefined;
    let demonstrationOriginMarker: MapLibreMarker | undefined;
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
        const fitDemonstration = () => {
          if (!map || !route) return;
          const points = route.geometry.coordinates;
          const longitudes = points.map(([longitude]) => longitude);
          const latitudes = points.map(([, latitude]) => latitude);
          const narrowMap = window.innerWidth < 1024;
          map.fitBounds(
            [
              [Math.min(...longitudes), Math.min(...latitudes)],
              [Math.max(...longitudes), Math.max(...latitudes)],
            ],
            {
              padding: {
                top: narrowMap ? 200 : 130,
                bottom: narrowMap ? 68 : 80,
                left: narrowMap ? 32 : 48,
                right: narrowMap ? 32 : 48,
              },
              duration: 0,
            },
          );
        };
        map.once("load", () => {
          if (route) {
            map?.addSource("route-preview-demonstration", {
              type: "geojson",
              data: route,
            });
            map?.addLayer({
              id: "route-preview-casing",
              type: "line",
              source: "route-preview-demonstration",
              paint: {
                "line-color": "#ffffff",
                "line-width": 13,
                "line-opacity": 0.95,
              },
              layout: { "line-cap": "round", "line-join": "round" },
            });
            map?.addLayer({
              id: "route-preview-line",
              type: "line",
              source: "route-preview-demonstration",
              paint: {
                "line-color": "#6437ed",
                "line-width": 7,
                "line-blur": 0.25,
              },
              layout: { "line-cap": "round", "line-join": "round" },
            });
            fitDemonstration();
          } else {
            map?.easeTo({
              center: [coordinates.longitude, coordinates.latitude],
              offset: [0, 55],
              duration: 0,
            });
          }
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
        if (route) {
          const demonstrationOriginElement = document.createElement("span");
          demonstrationOriginElement.className =
            "route-preview-map-origin route-preview-map-origin--demonstration";
          demonstrationOriginElement.setAttribute(
            "aria-label",
            "Point de départ fictif du tracé de démonstration",
          );
          demonstrationOriginMarker = new maplibre.Marker({
            element: demonstrationOriginElement,
          })
            .setLngLat(route.geometry.coordinates[0])
            .addTo(map);
        }
        if (origin && hasValidCoordinates(origin)) {
          const originElement = document.createElement("span");
          originElement.className =
            "route-preview-map-origin route-preview-map-origin--current";
          originElement.setAttribute("aria-label", "Votre position actuelle");
          originMarker = new maplibre.Marker({ element: originElement })
            .setLngLat([origin.longitude, origin.latitude])
            .addTo(map);
        }
        observer = new ResizeObserver(() => {
          map?.resize();
          if (route) fitDemonstration();
        });
        observer.observe(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      marker?.remove();
      originMarker?.remove();
      demonstrationOriginMarker?.remove();
      map?.remove();
    };
  }, [coordinates.latitude, coordinates.longitude, name, origin, route]);

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
