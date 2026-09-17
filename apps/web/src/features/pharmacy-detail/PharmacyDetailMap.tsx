import { useCallback, useEffect, useRef, useState } from "react";
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
  demonstrationVisible = true,
  focusDestination = false,
  interactive = false,
}: {
  coordinates: { latitude: number; longitude: number };
  name: string;
  origin?: { latitude: number; longitude: number } | null;
  route?: RouteLineFeature | null;
  demonstrationVisible?: boolean;
  focusDestination?: boolean;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);
  const createOriginMarkerRef = useRef<
    ((element: HTMLElement) => MapLibreMarker) | null
  >(null);
  const originRef = useRef(origin);
  const originMarkerRef = useRef<MapLibreMarker>(null);
  const mapViewRef = useRef<(() => void) | null>(null);
  const demonstrationVisibleRef = useRef(demonstrationVisible);
  const focusDestinationRef = useRef(focusDestination);
  originRef.current = origin;
  demonstrationVisibleRef.current = demonstrationVisible;
  focusDestinationRef.current = focusDestination;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapIdle, setMapIdle] = useState(false);

  const syncOriginMarker = useCallback(() => {
    const map = mapRef.current;
    const createMarker = createOriginMarkerRef.current;
    if (!map || !createMarker) return;
    const current = originRef.current;
    if (!current || !hasValidCoordinates(current)) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }
    if (!originMarkerRef.current) {
      const element = document.createElement("span");
      element.className =
        "route-preview-map-origin route-preview-map-origin--current";
      element.setAttribute("aria-label", "Votre position actuelle");
      originMarkerRef.current = createMarker(element)
        .setLngLat([current.longitude, current.latitude])
        .addTo(map);
    }
    originMarkerRef.current.setLngLat([current.longitude, current.latitude]);
  }, []);

  useEffect(() => {
    syncOriginMarker();
  }, [origin?.latitude, origin?.longitude, syncOriginMarker]);

  useEffect(() => {
    mapViewRef.current?.();
  }, [
    demonstrationVisible,
    focusDestination,
    origin?.latitude,
    origin?.longitude,
  ]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let marker: MapLibreMarker | undefined;
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
          interactive,
        });
        mapRef.current = map;
        createOriginMarkerRef.current = (element) =>
          new maplibre.Marker({ element });
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
        const applyView = () => {
          if (!map) return;
          setMapIdle(false);
          if (route) {
            const visibility = demonstrationVisibleRef.current
              ? "visible"
              : "none";
            for (const layer of [
              "route-preview-casing",
              "route-preview-line",
            ]) {
              if (map.getLayer(layer))
                map.setLayoutProperty(layer, "visibility", visibility);
            }
            if (demonstrationOriginMarker) {
              demonstrationOriginMarker.getElement().style.display =
                demonstrationVisibleRef.current ? "" : "none";
            }
          }
          if (demonstrationVisibleRef.current && route) {
            fitDemonstration();
            return;
          }
          const current = originRef.current;
          if (
            !focusDestinationRef.current &&
            !demonstrationVisibleRef.current &&
            current &&
            hasValidCoordinates(current)
          ) {
            map.fitBounds(
              [
                [current.longitude, current.latitude],
                [coordinates.longitude, coordinates.latitude],
              ],
              {
                padding: { top: 190, bottom: 85, left: 45, right: 45 },
                maxZoom: 15.5,
                duration: 0,
              },
            );
            return;
          }
          map.easeTo({
            center: [coordinates.longitude, coordinates.latitude],
            zoom: focusDestinationRef.current ? 15.5 : 14.5,
            offset: focusDestinationRef.current ? [0, 75] : [0, 55],
            duration: 0,
          });
        };
        mapViewRef.current = applyView;
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
          }
          applyView();
          setStatus("ready");
        });
        map.on("error", () => setStatus("error"));
        map.on("idle", () => {
          if (!cancelled) setMapIdle(true);
        });
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
        syncOriginMarker();
        observer = new ResizeObserver(() => {
          map?.resize();
          applyView();
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
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      mapRef.current = null;
      createOriginMarkerRef.current = null;
      mapViewRef.current = null;
      demonstrationOriginMarker?.remove();
      map?.remove();
    };
  }, [
    coordinates.latitude,
    coordinates.longitude,
    interactive,
    name,
    route,
    syncOriginMarker,
  ]);

  return (
    <section
      className="pharmacy-detail-map"
      aria-label={`Carte indiquant ${name}`}
    >
      <div
        className="pharmacy-detail-map__canvas"
        data-map-idle={mapIdle}
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
