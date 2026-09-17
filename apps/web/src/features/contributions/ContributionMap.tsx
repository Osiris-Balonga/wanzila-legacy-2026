import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

export type ProposedCoordinates = { latitude: number; longitude: number };

const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const styleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";

export function ContributionMap({
  onCenterChange,
  focusCoordinates,
}: {
  onCenterChange: (coordinates: ProposedCoordinates) => void;
  focusCoordinates: ProposedCoordinates | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        maplibre.setWorkerUrl(mapWorkerUrl);
        const instance = new maplibre.Map({
          container: container.current,
          style: styleUrl,
          center: [15.2832, -4.2634],
          zoom: 12,
          attributionControl: false,
        });
        instance.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        instance.once("load", () => setStatus("ready"));
        instance.on("error", () => setStatus("error"));
        instance.on("moveend", () => {
          const center = instance.getCenter();
          onCenterChange({ latitude: center.lat, longitude: center.lng });
        });
        map.current = instance;
        observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [onCenterChange]);

  useEffect(() => {
    if (focusCoordinates && map.current) {
      map.current.flyTo({
        center: [focusCoordinates.longitude, focusCoordinates.latitude],
        zoom: 16,
      });
    }
  }, [focusCoordinates]);

  return (
    <div className="contribution-map-wrap">
      <div
        aria-label="Carte pour placer la pharmacie"
        className="contribution-map"
        data-map-status={status}
        ref={container}
        role="region"
      />
      <span aria-hidden="true" className="contribution-map-pin">
        +
      </span>
      {status === "loading" && <p role="status">Chargement de la carte…</p>}
      {status === "error" && (
        <p role="status">
          Carte indisponible. Vous pouvez proposer la pharmacie avec son
          adresse.
        </p>
      )}
    </div>
  );
}
