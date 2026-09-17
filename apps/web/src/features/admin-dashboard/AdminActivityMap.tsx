import type { AdminAnalyticsActivityResponse } from "@wanzila/contracts";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Button } from "@/components/ui/button";

type PharmacyActivity =
  AdminAnalyticsActivityResponse["data"]["pharmacyActivity"];
type Pharmacy = PharmacyActivity["data"][number];
type Intensity = "low" | "medium" | "high";

const configuredStyleUrl: unknown = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl =
  typeof configuredStyleUrl === "string" && configuredStyleUrl !== ""
    ? configuredStyleUrl
    : "/maps/wanzila-style.json";
const count = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

function intensity(views: number): Intensity {
  if (views >= 10) return "high";
  if (views >= 2) return "medium";
  return "low";
}

export function AdminActivityMap({
  pharmacyActivity,
  onPageChange,
}: {
  pharmacyActivity: PharmacyActivity;
  onPageChange: (page: number) => void;
}) {
  const points = pharmacyActivity.data;
  const { page, pageSize, total, totalPages } = pharmacyActivity.pagination;
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
        const first = points[0]!;
        const map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl,
          center: [first.coordinates.longitude, first.coordinates.latitude],
          zoom: 11.6,
          attributionControl: false,
        });
        map.addControl(
          new maplibre.AttributionControl({ compact: false }),
          "bottom-left",
        );
        map.once("load", () => {
          if (cancelled) return;
          if (points.length > 1) {
            const bounds = new maplibre.LngLatBounds();
            points.forEach((point) =>
              bounds.extend([
                point.coordinates.longitude,
                point.coordinates.latitude,
              ]),
            );
            map.fitBounds(bounds, { padding: 36, maxZoom: 12, duration: 0 });
          }
          setStatus("ready");
        });
        map.on("error", () => {
          if (!cancelled) setStatus("error");
        });
        mapRef.current = map;
        markersRef.current = points.map((pharmacy) => {
          const marker = document.createElement("div");
          marker.className = `analytics-map-marker analytics-map-marker--${intensity(pharmacy.detailViews)}`;
          marker.setAttribute("aria-hidden", "true");
          marker.title = `${pharmacy.name} · ${count(pharmacy.detailViews)} consultations`;
          return new maplibre.Marker({ element: marker, anchor: "center" })
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

  const buckets: Array<{ key: Intensity; label: string; points: Pharmacy[] }> =
    [
      {
        key: "low",
        label: "1 vue",
        points: points.filter(
          (point) => intensity(point.detailViews) === "low",
        ),
      },
      {
        key: "medium",
        label: "2 à 9 vues",
        points: points.filter(
          (point) => intensity(point.detailViews) === "medium",
        ),
      },
      {
        key: "high",
        label: "10 vues et plus",
        points: points.filter(
          (point) => intensity(point.detailViews) === "high",
        ),
      },
    ];

  return (
    <div className="analytics-map">
      <p className="analytics-map__summary">
        {total === 0
          ? "Aucune pharmacie cartographiable sur cette période."
          : totalPages > 1
            ? `${count(Math.min(page * pageSize, total))} sur ${count(total)} pharmacies cartographiables`
            : `${count(total)} pharmacies cartographiables`}
        {" · "}
        {count(pharmacyActivity.mappedDetailViews)} consultations cartographiées
        {" · "}
        {count(pharmacyActivity.unmappedDetailViews)} consultations non
        cartographiées.
      </p>
      {points.length === 0 ? (
        <p className="analytics-map-empty" role="status">
          Aucun point statique à afficher. Aucune position de visiteur n’est
          utilisée.
        </p>
      ) : (
        <>
          <div
            aria-label="Consultations de fiches par pharmacie géocodée"
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
              Fond de carte indisponible. Les valeurs restent consultables dans
              le tableau ci-dessous.
            </p>
          ) : null}
          <ul
            aria-label="Légende des tailles de marqueurs"
            className="analytics-map__legend"
          >
            {buckets.map((bucket) => (
              <li
                className={`analytics-map__legend-${bucket.key}`}
                key={bucket.key}
              >
                {bucket.label} : {count(bucket.points.length)} pharmacie
                {bucket.points.length > 1 ? "s" : ""} sur cette page
              </li>
            ))}
          </ul>
          <details className="analytics-map__details">
            <summary>Voir les pharmacies de cette page</summary>
            <table aria-label="Activité des pharmacies cartographiées">
              <thead>
                <tr>
                  <th scope="col">Pharmacie</th>
                  <th scope="col">Consultations</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pharmacy) => (
                  <tr key={pharmacy.pharmacyId}>
                    <th scope="row">{pharmacy.name}</th>
                    <td>{count(pharmacy.detailViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      {totalPages > 1 ? (
        <nav
          aria-label="Pagination de la carte"
          className="analytics-map__pagination"
        >
          <Button
            aria-label="Page précédente"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            type="button"
            variant="outline"
          >
            Précédent
          </Button>
          <span>
            Page {count(page)} sur {count(totalPages)}
          </span>
          <Button
            aria-label="Page suivante"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            type="button"
            variant="outline"
          >
            Suivant
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
