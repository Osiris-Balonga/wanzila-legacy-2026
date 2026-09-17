import { ClockIcon } from "@phosphor-icons/react/Clock";
import { CarIcon } from "@phosphor-icons/react/Car";
import { CrosshairIcon } from "@phosphor-icons/react/Crosshair";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
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
import { DEFAULT_ARRIVAL_RADIUS_METERS } from "@wanzila/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createAnalyticsTransport } from "@/analytics/transport";
import {
  createPharmacyDetailClient,
  type PharmacyDetailState,
} from "../pharmacy-detail/pharmacy-detail-client";
import { PharmacyDetailMap } from "../pharmacy-detail/PharmacyDetailMap";
import { ArrivalControls, ArrivalMapBanner } from "./ArrivalControls";
import { createArrivalTracker, type ArrivalState } from "./arrival-tracker";
import { createRouteClient, type RouteState } from "./route-client";
import {
  buildExternalDirectionsUrl,
  classifyGeolocationError,
  describeRouteStep,
  formatRouteDistance,
  formatRouteDuration,
  hasUsableCoordinates,
  routeFeature,
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
  { value: "walk", label: "À pied", icon: PersonSimpleWalkIcon },
];

function RoutePreviewContent({ pharmacy }: { pharmacy: PublicPharmacy }) {
  const analytics = useMemo(
    () => createAnalyticsTransport({ endpoint: "/api/v1/analytics/events" }),
    [],
  );
  const [mode, setMode] = useState<TravelMode>("car");
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [routeConsent, setRouteConsent] = useState(false);
  const [routeState, setRouteState] = useState<RouteState>({ status: "idle" });
  const [routeRetry, setRouteRetry] = useState(0);
  const routeClient = useMemo(
    () =>
      createRouteClient({ fetch: (input, init) => window.fetch(input, init) }),
    [],
  );
  const [arrivalState, setArrivalState] = useState<ArrivalState>({
    status: "idle",
  });
  const [arrivalPosition, setArrivalPosition] = useState<Coordinates | null>(
    null,
  );
  const arrivalTracker = useRef<ReturnType<typeof createArrivalTracker> | null>(
    null,
  );
  const [copyFeedback, setCopyFeedback] = useState("");
  const requestVersion = useRef(0);
  const destination = hasUsableCoordinates(pharmacy.coordinates)
    ? pharmacy.coordinates
    : undefined;
  const destinationLatitude = destination?.latitude;
  const destinationLongitude = destination?.longitude;
  const showingNavigation =
    arrivalState.status === "requesting" ||
    arrivalState.status === "active" ||
    arrivalState.status === "arrived";
  const route = routeState.status === "success" ? routeState.route : null;
  const routeLine = useMemo(
    () => (route ? routeFeature(route) : null),
    [route],
  );
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
      routeClient.cancel();
    },
    [routeClient],
  );

  useEffect(() => {
    if (!routeConsent || location.status !== "obtained" || !destination) return;
    const origin = location.position;
    let current = true;
    setRouteState({ status: "loading" });
    void routeClient
      .load({
        pharmacyId: pharmacy.id,
        origin,
        mode,
        locationConsent: true,
      })
      .then((next) => {
        if (current) setRouteState(next);
      });
    return () => {
      current = false;
      routeClient.cancel();
    };
  }, [
    routeClient,
    routeConsent,
    location,
    pharmacy.id,
    destinationLatitude,
    destinationLongitude,
    mode,
    routeRetry,
  ]);

  useEffect(() => {
    if (destinationLatitude === undefined || destinationLongitude === undefined)
      return;
    const tracker = createArrivalTracker({
      geolocation: navigator.geolocation,
      destination: {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      },
      radiusMeters: DEFAULT_ARRIVAL_RADIUS_METERS,
      onState: setArrivalState,
      onPosition: setArrivalPosition,
      onStart: () =>
        analytics.track({
          schemaVersion: 1,
          name: "route_started",
          properties: { pharmacyId: pharmacy.id },
        }),
      onArrival: () =>
        analytics.track({
          schemaVersion: 1,
          name: "arrival_confirmed",
          properties: { pharmacyId: pharmacy.id },
        }),
    });
    arrivalTracker.current = tracker;
    return () => {
      tracker.dispose();
      arrivalTracker.current = null;
    };
  }, [analytics, destinationLatitude, destinationLongitude, pharmacy.id]);

  useEffect(() => {
    if (!showingNavigation) return;
    const onPopState = () => {
      if (
        window.location.pathname !== `/pharmacies/${pharmacy.id}/navigation`
      ) {
        arrivalTracker.current?.cancel();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pharmacy.id, showingNavigation]);

  function startArrival() {
    if (!destination || !arrivalTracker.current) return;
    if (!arrivalTracker.current.start()) return;
    const path = `/pharmacies/${pharmacy.id}/navigation`;
    if (window.location.pathname !== path)
      window.history.pushState(null, "", path);
  }

  function quitArrival() {
    arrivalTracker.current?.cancel();
    if (window.location.pathname.endsWith("/navigation")) {
      window.history.replaceState(
        null,
        "",
        `/pharmacies/${pharmacy.id}/itineraire`,
      );
    }
  }

  function requestLocation() {
    const version = ++requestVersion.current;
    routeClient.cancel();
    setRouteConsent(false);
    setRouteState({ status: "idle" });
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
    routeClient.cancel();
    setRouteConsent(false);
    setRouteState({ status: "idle" });
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
            origin={
              arrivalPosition ??
              (location.status === "obtained" ? location.position : null)
            }
            route={routeLine}
            focusDestination={arrivalState.status === "arrived"}
          />
        ) : (
          <p className="route-preview-map-missing" role="status">
            Carte indisponible : coordonnées de destination indisponibles.
          </p>
        )}
        <ArrivalMapBanner
          state={arrivalState}
          pharmacyName={pharmacy.name}
          radiusMeters={DEFAULT_ARRIVAL_RADIUS_METERS}
        />
        {route ? (
          <div className="route-preview-map-badge" role="note">
            {mode === "car" ? (
              <CarIcon aria-hidden="true" weight="fill" />
            ) : (
              <PersonSimpleWalkIcon aria-hidden="true" weight="fill" />
            )}
            <span>
              {formatRouteDuration(route.durationSeconds)} ·{" "}
              {formatRouteDistance(route.distanceMeters)}
            </span>
            <small>Itinéraire calculé</small>
          </div>
        ) : null}
        {!showingNavigation ? (
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
        ) : null}
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

        {!showingNavigation ? (
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
        ) : null}

        {route ? (
          <div className="route-preview-summary">
            <div>
              <strong>{formatRouteDuration(route.durationSeconds)}</strong>{" "}
              <span>({formatRouteDistance(route.distanceMeters)})</span>
            </div>
            <p>Trajet estimé sans trafic en temps réel.</p>
          </div>
        ) : !showingNavigation ? (
          <div className="route-preview-no-route" role="status">
            <p>
              {routeState.status === "loading"
                ? "Calcul de l’itinéraire en cours…"
                : routeState.status === "no-route"
                  ? "Aucun trajet routier trouvé pour ce mode et cette destination."
                  : routeState.status === "rate-limited"
                    ? "Service de trajet occupé. Réessayez dans quelques instants."
                    : routeState.status === "unavailable"
                      ? "Calcul de l’itinéraire indisponible. Réessayez ou ouvrez la destination dans Google Maps."
                      : "Localisez-vous puis autorisez le calcul pour afficher un trajet réel."}
            </p>
            {routeConsent &&
            routeState.status !== "loading" &&
            routeState.status !== "idle" ? (
              <Button
                onClick={() => setRouteRetry((value) => value + 1)}
                type="button"
                variant="outline"
              >
                Réessayer le calcul
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="route-preview-stops">
          {!showingNavigation ? (
            <div>
              <span
                aria-hidden="true"
                className="route-preview-stops__origin"
              />
              <p>
                <strong>Départ : votre position, si autorisée</strong>
                <small>
                  {routeConsent
                    ? "Position envoyée pour calculer ce trajet après votre accord."
                    : "Aucune position transmise pour le calcul du trajet."}
                </small>
              </p>
            </div>
          ) : null}
          <div>
            <MapPinIcon aria-hidden="true" weight="fill" />
            <p>
              <strong>Arrivée : {pharmacy.name}</strong>
              <small>{address || "Adresse non renseignée"}</small>
            </p>
          </div>
        </div>

        {!showingNavigation &&
        location.status === "obtained" &&
        !routeConsent ? (
          <div className="route-preview-consent">
            <p>
              Pour calculer le trajet, votre point de départ précis sera envoyé
              à Wanzila puis au service FOSSGIS / OpenStreetMap. Ce service
              journalise les requêtes. Wanzila ne conserve pas votre position.
            </p>
            <Button onClick={() => setRouteConsent(true)} type="button">
              Calculer l’itinéraire avec ma position
            </Button>
          </div>
        ) : null}

        {route ? (
          <section
            aria-label="Étapes de l’itinéraire"
            className="route-preview-steps"
          >
            <h2>Étapes du trajet</h2>
            <p>
              À consulter avant de partir · aucun guidage vocal ni recalcul
              automatique.
            </p>
            {route.snapDistanceMeters.destination >
            DEFAULT_ARRIVAL_RADIUS_METERS ? (
              <p className="route-preview-snap-warning" role="note">
                Le trajet routier se termine à{" "}
                {formatRouteDistance(route.snapDistanceMeters.destination)} du
                point de la pharmacie. Vérifiez le dernier accès sur la carte.
              </p>
            ) : null}
            <ol>
              {route.steps.map((step, index) => (
                <li key={index}>
                  <span>
                    {describeRouteStep(step)}
                    {step.name ? ` · ${step.name}` : ""}
                  </span>
                  <small>{formatRouteDistance(step.distanceMeters)}</small>
                </li>
              ))}
            </ol>
            <p className="route-preview-attribution">
              Trajet :{" "}
              <a
                href={route.provider.attributionUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {route.provider.name}
              </a>
              {" · "}
              <a
                href={route.provider.fixMapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Corriger la carte
              </a>
            </p>
          </section>
        ) : null}

        {destination ? (
          <ArrivalControls
            state={arrivalState}
            radiusMeters={DEFAULT_ARRIVAL_RADIUS_METERS}
            onStart={startArrival}
            onQuit={quitArrival}
            routeWasRequested={routeConsent}
          />
        ) : null}

        {!showingNavigation ? (
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
        ) : null}
        {!showingNavigation ? (
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
        ) : null}
        <p
          aria-live="polite"
          className="route-preview-copy-feedback"
          role="status"
        >
          {copyFeedback}
        </p>
        {directionsHref ? (
          <Button asChild className="route-preview-external" variant="outline">
            <a
              aria-label="Ouvrir l’itinéraire dans Google Maps"
              href={directionsHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Navigation aria-hidden="true" /> Ouvrir aussi dans Google Maps
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
