import { CrosshairIcon } from "@phosphor-icons/react/Crosshair";
import { NavigationArrowIcon } from "@phosphor-icons/react/NavigationArrow";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArrivalState } from "./arrival-tracker";
import "./arrival-detection.css";

export function ArrivalMapBanner({
  state,
  pharmacyName,
  radiusMeters,
}: {
  state: ArrivalState;
  pharmacyName: string;
  radiusMeters: number;
}) {
  if (
    state.status !== "requesting" &&
    state.status !== "active" &&
    state.status !== "arrived" &&
    state.status !== "already-nearby" &&
    state.status !== "manual-declared"
  ) {
    return null;
  }
  return (
    <div className="arrival-map-banner" aria-live="polite">
      <span aria-hidden="true" className="arrival-map-banner__icon">
        {state.status === "arrived" ||
        state.status === "already-nearby" ||
        state.status === "manual-declared" ? (
          <Check />
        ) : (
          <NavigationArrowIcon weight="fill" />
        )}
      </span>
      <div>
        <small>Suivi de proximité</small>
        <h2>
          {state.status === "already-nearby"
            ? "Déjà à proximité"
            : state.status === "manual-declared"
              ? "Arrivée déclarée"
              : state.status === "arrived"
                ? "Arrivée à proximité estimée"
                : state.status === "requesting"
                  ? "Recherche de votre position…"
                  : "Suivi d’arrivée en cours"}
        </h2>
        <p>
          {state.status === "already-nearby"
            ? `Vous étiez déjà à proximité de ${pharmacyName} au début du suivi. Le trajet parcouru n’est pas confirmé.`
            : state.status === "manual-declared"
              ? `Vous avez déclaré être arrivé à ${pharmacyName}. Cette arrivée n’a pas été vérifiée par GPS.`
              : state.status === "arrived"
                ? `Position probablement à ${radiusMeters} m ou moins de ${pharmacyName}, à vol d’oiseau, selon la précision estimée du GPS.`
                : `Rapprochez-vous de ${pharmacyName}. Consultez les étapes du trajet ; aucun guidage en temps réel n’est fourni.`}
        </p>
      </div>
    </div>
  );
}

const failures = {
  denied:
    "Position refusée. Le suivi reste arrêté ; l’adresse et Google Maps restent disponibles.",
  timeout:
    "La recherche de position a expiré. Réessayez ou ouvrez Google Maps.",
  unavailable:
    "Position indisponible. Le suivi reste arrêté ; vous pouvez ouvrir Google Maps.",
  unsupported:
    "Ce navigateur ne prend pas en charge la géolocalisation. Les étapes du trajet restent consultables.",
} as const;

export function ArrivalControls({
  state,
  radiusMeters,
  onStart,
  onQuit,
  onDeclare,
  canDeclare = false,
  starting = false,
  recording = false,
  routeWasRequested = false,
}: {
  state: ArrivalState;
  radiusMeters: number;
  onStart: () => void;
  onQuit: () => void;
  onDeclare?: () => void;
  canDeclare?: boolean;
  starting?: boolean;
  recording?: boolean;
  routeWasRequested?: boolean;
}) {
  const tracking = state.status === "requesting" || state.status === "active";
  const failure =
    state.status === "denied" ||
    state.status === "timeout" ||
    state.status === "unavailable" ||
    state.status === "unsupported";

  return (
    <section aria-label="Suivi d’arrivée" className="arrival-controls">
      {state.status === "active" ? (
        <div className="arrival-controls__distance" role="status">
          <CrosshairIcon aria-hidden="true" weight="fill" />
          <p>
            <strong>{Math.round(state.distanceMeters)} m</strong>
            <span>
              Distance GPS estimée à vol d’oiseau · seuil d’arrivée{" "}
              {radiusMeters} m
            </span>
          </p>
        </div>
      ) : null}
      {state.status === "active" && state.arrivalUncertain ? (
        <p className="arrival-controls__uncertain" role="status">
          Position proche, mais précision insuffisante du GPS pour confirmer
          l’arrivée. Le suivi continue.
        </p>
      ) : null}
      {state.status === "arrived" ? (
        <p className="arrival-controls__feedback" role="status">
          <Check aria-hidden="true" /> Proximité estimée par le GPS une seule
          fois. La position n’est plus suivie.
        </p>
      ) : null}
      {state.status === "already-nearby" ? (
        <p className="arrival-controls__feedback" role="status">
          <Check aria-hidden="true" /> Déjà à proximité au premier point GPS
          fiable. Aucun trajet parcouru n’est déduit.
        </p>
      ) : null}
      {state.status === "manual-declared" ? (
        <p className="arrival-controls__feedback" role="status">
          <Check aria-hidden="true" /> Arrivée déclarée par vous, sans
          confirmation GPS.
        </p>
      ) : null}
      {state.status === "cancelled" ? (
        <p className="arrival-controls__feedback" role="status">
          <X aria-hidden="true" /> Suivi arrêté. Aucune position n’est suivie.
        </p>
      ) : null}
      {failure ? (
        <p
          className="arrival-controls__feedback arrival-controls__feedback--error"
          role="alert"
        >
          {failures[state.status]}
        </p>
      ) : null}
      <p className="arrival-controls__privacy">
        Votre position GPS est utilisée uniquement pendant ce suivi, sur cet
        appareil, pour estimer votre proximité. Aucune coordonnée de suivi n’est
        enregistrée ni envoyée à Wanzila.
        {routeWasRequested
          ? " Le point de départ a été envoyé séparément, avec votre accord, pour calculer l’itinéraire."
          : ""}{" "}
        Le suivi s’arrête quand vous quittez la page.
      </p>
      <Button
        className="arrival-controls__action"
        disabled={starting || recording}
        onClick={
          tracking ||
          state.status === "arrived" ||
          state.status === "already-nearby" ||
          state.status === "manual-declared"
            ? onQuit
            : onStart
        }
        type="button"
      >
        {recording ? (
          <>Enregistrement du résultat…</>
        ) : starting ? (
          <>Démarrage du suivi…</>
        ) : tracking ? (
          <>
            <X aria-hidden="true" /> Quitter le suivi
          </>
        ) : state.status === "arrived" ||
          state.status === "already-nearby" ||
          state.status === "manual-declared" ? (
          <>
            <Check aria-hidden="true" /> Terminer le suivi
          </>
        ) : failure ? (
          <>
            <CrosshairIcon aria-hidden="true" weight="fill" /> Réessayer le
            suivi
          </>
        ) : (
          <>
            <NavigationArrowIcon aria-hidden="true" weight="fill" /> Démarrer le
            suivi d’arrivée
          </>
        )}
      </Button>
      {canDeclare && onDeclare ? (
        <Button
          className="arrival-controls__declare"
          onClick={onDeclare}
          type="button"
          variant="outline"
        >
          Je suis arrivé
        </Button>
      ) : null}
    </section>
  );
}
