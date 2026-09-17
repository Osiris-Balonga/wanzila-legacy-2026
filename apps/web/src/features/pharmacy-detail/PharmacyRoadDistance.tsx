import { routeResponseSchema, type PublicPharmacy } from "@wanzila/contracts";
import { Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type DistanceState =
  | { status: "idle" | "locating" | "routing" }
  | { status: "ready"; distanceMeters: number; durationSeconds: number }
  | { status: "error"; message: string };

function distanceLabel(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat("fr-CG", { maximumFractionDigits: 1 }).format(meters / 1_000)} km`;
}

function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export function PharmacyRoadDistance({
  pharmacy,
}: {
  pharmacy: PublicPharmacy;
}) {
  const [state, setState] = useState<DistanceState>({ status: "idle" });
  const requestVersion = useRef(0);

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );

  function calculate() {
    const version = ++requestVersion.current;
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message: "Position indisponible sur ce navigateur.",
      });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (version !== requestVersion.current) return;
        const { latitude, longitude, accuracy } = position.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(accuracy) ||
          accuracy > 100
        ) {
          setState({
            status: "error",
            message:
              "Position trop imprécise pour calculer une distance routière fiable.",
          });
          return;
        }
        setState({ status: "routing" });
        void fetch("/api/v1/routes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pharmacyId: pharmacy.id,
            origin: { latitude, longitude },
            mode: "car",
            locationConsent: true,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(
                response.status === 429
                  ? "Service occupé. Réessayez dans un instant."
                  : response.status === 422
                    ? "Aucun trajet routier trouvé depuis cette position."
                    : "Calcul routier indisponible. Réessayez plus tard.",
              );
            }
            const parsed = routeResponseSchema.safeParse(await response.json());
            if (
              !parsed.success ||
              parsed.data.data.pharmacyId !== pharmacy.id
            ) {
              throw new Error("Réponse d’itinéraire invalide. Réessayez.");
            }
            if (version !== requestVersion.current) return;
            setState({
              status: "ready",
              distanceMeters: parsed.data.data.distanceMeters,
              durationSeconds: parsed.data.data.durationSeconds,
            });
          })
          .catch((error: unknown) => {
            if (version !== requestVersion.current) return;
            setState({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Calcul routier indisponible. Réessayez plus tard.",
            });
          });
      },
      (error) => {
        if (version !== requestVersion.current) return;
        setState({
          status: "error",
          message:
            error.code === 1
              ? "Position refusée. La distance routière ne peut pas être calculée."
              : "Position indisponible. Réessayez plus tard.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const busy = state.status === "locating" || state.status === "routing";
  return (
    <div className="pharmacy-road-distance">
      <Route aria-hidden="true" />
      <div>
        <strong>Distance routière en voiture</strong>
        {state.status === "ready" ? (
          <p role="status">
            {distanceLabel(state.distanceMeters)} · environ{" "}
            {durationLabel(state.durationSeconds)} hors trafic
          </p>
        ) : state.status === "error" ? (
          <p role="alert">{state.message}</p>
        ) : busy ? (
          <p role="status">
            {state.status === "locating"
              ? "Recherche de votre position…"
              : "Calcul de l’itinéraire…"}
          </p>
        ) : (
          <p>Distance disponible après votre accord de localisation.</p>
        )}
        <small>
          Votre position est envoyée à Wanzila et au service FOSSGIS pour ce
          calcul, sans être conservée dans un historique Wanzila. Données
          routières :{" "}
          <a
            href="https://routing.openstreetmap.de/about.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            FOSSGIS / OSRM / OpenStreetMap
          </a>
          .{" "}
          <a
            href="https://www.openstreetmap.org/fixthemap"
            target="_blank"
            rel="noopener noreferrer"
          >
            Corriger la carte
          </a>
          .
        </small>
        <Button
          disabled={busy}
          onClick={calculate}
          type="button"
          variant="outline"
        >
          {state.status === "ready"
            ? "Actualiser la distance"
            : "Calculer la distance"}
        </Button>
      </div>
    </div>
  );
}
