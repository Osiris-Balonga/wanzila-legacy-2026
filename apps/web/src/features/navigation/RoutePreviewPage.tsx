import { ClockIcon } from "@phosphor-icons/react/Clock";
import { CarIcon } from "@phosphor-icons/react/Car";
import { CrosshairIcon } from "@phosphor-icons/react/Crosshair";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import { MotorcycleIcon } from "@phosphor-icons/react/Motorcycle";
import { PersonSimpleWalkIcon } from "@phosphor-icons/react/PersonSimpleWalk";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Navigation,
  Phone,
  RotateCcw,
  X,
} from "lucide-react";
import type { PublicPharmacy } from "@wanzila/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPharmacyDetailClient,
  type PharmacyDetailState,
} from "../pharmacy-detail/pharmacy-detail-client";
import { PharmacyDetailMap } from "../pharmacy-detail/PharmacyDetailMap";
import {
  buildExternalDirectionsUrl,
  classifyGeolocationError,
  getDemonstrationRoute,
  hasUsableCoordinates,
  type Coordinates,
  type LocationFailure,
  type TravelMode,
} from "./route-preview";
import "./route-preview.css";

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "obtained"; position: Coordinates }
  | { status: LocationFailure | "unsupported" };

const modeOptions: {
  value: TravelMode;
  label: string;
  icon: typeof CarIcon;
}[] = [
  { value: "car", label: "Voiture", icon: CarIcon },
  { value: "moto", label: "Moto", icon: MotorcycleIcon },
  { value: "walk", label: "À pied", icon: PersonSimpleWalkIcon },
];

function RoutePreviewContent({ pharmacy }: { pharmacy: PublicPharmacy }) {
  const [mode, setMode] = useState<TravelMode>("car");
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [copyFeedback, setCopyFeedback] = useState("");
  const requestVersion = useRef(0);
  const destination = hasUsableCoordinates(pharmacy.coordinates)
    ? pharmacy.coordinates
    : undefined;
  const route = getDemonstrationRoute(pharmacy, mode);
  const directionsHref = buildExternalDirectionsUrl(destination, mode);
  const address = Array.from(
    new Set(
      [
        pharmacy.address.line,
        pharmacy.address.district,
        pharmacy.address.arrondissement,
      ].filter((part): part is string => Boolean(part)),
    ),
  ).join(", ");

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );

  function requestLocation() {
    const version = ++requestVersion.current;
    if (!navigator.geolocation) {
      setLocation({ status: "unsupported" });
      return;
    }
    setLocation({ status: "requesting" });
    try {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          if (version !== requestVersion.current) return;
          const position = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          };
          setLocation(
            hasUsableCoordinates(position)
              ? { status: "obtained", position }
              : { status: "unavailable" },
          );
        },
        (error) => {
          if (version === requestVersion.current) {
            setLocation({ status: classifyGeolocationError(error) });
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
      );
    } catch {
      if (version === requestVersion.current) {
        setLocation({ status: "unavailable" });
      }
    }
  }

  function clearLocation() {
    requestVersion.current += 1;
    setLocation({ status: "idle" });
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyFeedback("Adresse copiée.");
    } catch {
      setCopyFeedback(
        "Copie impossible. Sélectionnez l’adresse pour la copier.",
      );
    }
  }

  const locationMessages: Record<LocationFailure | "unsupported", string> = {
    denied:
      "Position refusée. Vous pouvez toujours consulter l’adresse et ouvrir Google Maps.",
    unavailable:
      "Position indisponible. Réessayez ou ouvrez Google Maps avec la destination.",
    timeout:
      "La recherche de position a expiré. Réessayez si vous le souhaitez.",
    unsupported: "Ce navigateur ne prend pas en charge la géolocalisation.",
  };

  return (
    <>
      <section
        className="route-preview-map-area"
        aria-label="Carte de l’itinéraire"
      >
        <div className="route-preview-header">
          <a aria-label="Retour à la fiche" href={`/pharmacies/${pharmacy.id}`}>
            <ArrowLeft aria-hidden="true" />
          </a>
          <div>
            <strong>{pharmacy.name}</strong>
            <span>{pharmacy.address.line || "Adresse non renseignée"}</span>
          </div>
          <a
            aria-label="Fermer l’itinéraire"
            href={`/pharmacies/${pharmacy.id}`}
          >
            <X aria-hidden="true" />
          </a>
        </div>
        {destination ? (
          <PharmacyDetailMap
            coordinates={destination}
            interactive
            name={pharmacy.name}
            origin={location.status === "obtained" ? location.position : null}
            route={route?.feature ?? null}
          />
        ) : (
          <p className="route-preview-map-missing" role="status">
            Carte indisponible : coordonnées de destination indisponibles.
          </p>
        )}
        {route ? (
          <div className="route-preview-map-badge" role="note">
            <CarIcon aria-hidden="true" weight="fill" />
            <span>7 min · 2,4 km</span>
            <small>Démonstration</small>
          </div>
        ) : null}
        <div className="route-preview-map-controls">
          <Button
            aria-label="Me localiser sur la carte"
            onClick={requestLocation}
            disabled={location.status === "requesting"}
            size="icon"
            title="Me localiser sur la carte"
            type="button"
            variant="outline"
          >
            <CrosshairIcon aria-hidden="true" weight="fill" />
          </Button>
        </div>
      </section>

      <section aria-label="Aperçu du trajet" className="route-preview-panel">
        <span aria-hidden="true" className="route-preview-panel__handle" />
        <div className="route-preview-identity">
          <span aria-hidden="true" className="route-preview-identity__icon">
            +
          </span>
          <div>
            <h1>{pharmacy.name}</h1>
            <p>{address || "Adresse non renseignée"}</p>
            {pharmacy.currentDuty ? (
              <span className="route-preview-identity__duty">
                <ClockIcon aria-hidden="true" weight="fill" /> De garde
                actuellement
              </span>
            ) : (
              <span className="route-preview-identity__uncertain">
                Garde non confirmée
              </span>
            )}
          </div>
          <a
            aria-label="Voir la fiche de la pharmacie"
            href={`/pharmacies/${pharmacy.id}`}
          >
            ›
          </a>
        </div>

        <div
          aria-label="Mode de déplacement"
          className="route-preview-modes"
          role="group"
        >
          {modeOptions.map(({ value, label, icon: Icon }) => (
            <button
              aria-pressed={mode === value}
              className={mode === value ? "route-preview-modes__active" : ""}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              <Icon aria-hidden="true" weight="fill" /> {label}
            </button>
          ))}
        </div>

        {route ? (
          <div className="route-preview-summary">
            <div>
              <strong>{route.durationMinutes} min</strong>{" "}
              <span>({route.distanceKm.toLocaleString("fr-CG")} km)</span>
            </div>
            <p>Tracé de démonstration · ni trafic ni trajet calculé.</p>
          </div>
        ) : (
          <Alert className="route-preview-no-route">
            <AlertDescription>
              Aucun trajet calculé pour ce mode ou cette destination. Google
              Maps peut proposer un itinéraire réel.
            </AlertDescription>
          </Alert>
        )}

        <div className="route-preview-stops">
          <div>
            <span aria-hidden="true" className="route-preview-stops__origin" />
            <p>
              <strong>
                {route
                  ? "Départ du tracé : point fictif"
                  : "Départ : votre position, si autorisée"}
              </strong>
              <small>
                {route
                  ? "Le tracé de démonstration n’utilise pas votre position."
                  : "Aucune position transmise à Wanzila."}
              </small>
            </p>
          </div>
          <div>
            <MapPinIcon aria-hidden="true" weight="fill" />
            <p>
              <strong>Arrivée : {pharmacy.name}</strong>
              <small>{address || "Adresse non renseignée"}</small>
            </p>
          </div>
        </div>

        <div
          aria-live="polite"
          className="route-preview-location"
          role="status"
        >
          {location.status === "requesting" ? (
            <p>Recherche de votre position…</p>
          ) : null}
          {location.status === "obtained" ? (
            <p>
              <Check aria-hidden="true" /> Position obtenue pour cette session
              uniquement.
            </p>
          ) : null}
          {location.status !== "idle" &&
          location.status !== "requesting" &&
          location.status !== "obtained" ? (
            <p>{locationMessages[location.status]}</p>
          ) : null}
        </div>
        <div className="route-preview-utility-actions">
          {location.status === "requesting" ? (
            <Button onClick={clearLocation} type="button" variant="outline">
              Annuler la localisation
            </Button>
          ) : location.status === "obtained" ? (
            <Button onClick={clearLocation} type="button" variant="outline">
              Effacer ma position
            </Button>
          ) : location.status !== "idle" ? (
            <Button onClick={requestLocation} type="button" variant="outline">
              <RotateCcw aria-hidden="true" /> Réessayer la position
            </Button>
          ) : (
            <Button onClick={requestLocation} type="button" variant="outline">
              <CrosshairIcon aria-hidden="true" weight="fill" /> Utiliser ma
              position
            </Button>
          )}
          {address ? (
            <Button
              onClick={() => void copyAddress()}
              type="button"
              variant="outline"
            >
              <Clipboard aria-hidden="true" /> Copier l’adresse
            </Button>
          ) : null}
          {pharmacy.phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${pharmacy.phone.replace(/[\s().-]/g, "")}`}>
                <Phone aria-hidden="true" /> Appeler
              </a>
            </Button>
          ) : null}
        </div>
        <p
          aria-live="polite"
          className="route-preview-copy-feedback"
          role="status"
        >
          {copyFeedback}
        </p>
        {directionsHref ? (
          <Button asChild className="route-preview-start">
            <a
              aria-label="Ouvrir l’itinéraire dans Google Maps"
              href={directionsHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Navigation aria-hidden="true" /> Démarrer dans Google Maps
            </a>
          </Button>
        ) : (
          <Alert className="route-preview-missing-destination">
            <AlertDescription>
              Coordonnées de destination indisponibles. Consultez l’adresse ou
              appelez la pharmacie.
            </AlertDescription>
          </Alert>
        )}
      </section>
    </>
  );
}

export function RoutePreviewRoute({ id }: { id: string }) {
  const client = useMemo(
    () =>
      createPharmacyDetailClient({
        fetch: (input, init) => window.fetch(input, init),
      }),
    [],
  );
  const [state, setState] = useState<PharmacyDetailState>({
    status: "loading",
  });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const next = await client.load(id);
    if (next.status !== "idle") setState(next);
  }, [client, id]);

  useEffect(() => {
    void load();
    return () => client.cancel();
  }, [client, load]);

  return (
    <main className="route-preview-page" id="public-content">
      {state.status === "success" ? (
        <RoutePreviewContent pharmacy={state.pharmacy} />
      ) : (
        <section className="route-preview-fallback">
          <a href={`/pharmacies/${id}`}>
            <ArrowLeft aria-hidden="true" /> Retour à la fiche
          </a>
          {state.status === "loading" || state.status === "idle" ? (
            <div aria-label="Chargement de l’itinéraire" role="status">
              <Skeleton className="route-preview-fallback__map" />
              <Skeleton className="route-preview-fallback__text" />
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                {state.status === "not-found"
                  ? "Pharmacie introuvable."
                  : "Fiche indisponible. Vérifiez votre connexion puis réessayez."}
              </AlertDescription>
              {state.status === "error" ? (
                <Button
                  onClick={() => void load()}
                  type="button"
                  variant="outline"
                >
                  Réessayer
                </Button>
              ) : null}
            </Alert>
          )}
        </section>
      )}
    </main>
  );
}
