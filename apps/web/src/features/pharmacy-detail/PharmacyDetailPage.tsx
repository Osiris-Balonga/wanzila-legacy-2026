import type { PublicPharmacy } from "@wanzila/contracts";
import { BuildingsIcon } from "@phosphor-icons/react/Buildings";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import {
  Bookmark,
  ChevronLeft,
  CircleAlert,
  Clipboard,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAnalyticsTransport } from "@/analytics/transport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPharmacyDetailClient,
  type PharmacyDetailState,
} from "./pharmacy-detail-client";
import { hasValidCoordinates, PharmacyDetailMap } from "./PharmacyDetailMap";
import "./pharmacy-detail.css";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-CG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

function formatPhone(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");
  const congoleseMobile = /^\+242(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(compact);
  return congoleseMobile
    ? `+242 ${congoleseMobile[1]} ${congoleseMobile[2]} ${congoleseMobile[3]} ${congoleseMobile[4]}`
    : value.replace(/\s+/g, " ").trim();
}

function dialablePhone(phone: string | undefined): phone is string {
  return Boolean(phone && /^[+\d\s().-]+$/.test(phone) && /\d/.test(phone));
}

type DutyView = { label: string; detail: string; kind: "fresh" | "uncertain" };

export function describeDuty(pharmacy: PublicPharmacy): DutyView {
  const duty = pharmacy.currentDuty;
  if (!duty) {
    return {
      label: "Garde non confirmée",
      detail:
        "Aucune garde active renseignée. Appelez la pharmacie avant de vous déplacer.",
      kind: "uncertain",
    };
  }
  if (duty.sourceFreshness === "STALE") {
    return {
      label: "Garde à confirmer",
      detail:
        "Source ancienne : confirmez la disponibilité par téléphone avant de vous déplacer.",
      kind: "uncertain",
    };
  }
  if (duty.sourceFreshness === "UNKNOWN") {
    return {
      label: "Garde à confirmer",
      detail:
        "Fraîcheur de la source inconnue : confirmez la disponibilité par téléphone.",
      kind: "uncertain",
    };
  }
  return {
    label: "De garde actuellement",
    detail:
      "Information de garde actualisée. Confirmez la disponibilité avant de vous déplacer.",
    kind: "fresh",
  };
}

function DetailNavigation() {
  return (
    <nav aria-label="Navigation publique" className="pharmacy-detail-nav">
      <a aria-current="page" href="/#map">
        <MapPinIcon aria-hidden="true" weight="fill" />
        <span>Carte</span>
      </a>
      <button disabled title="Enregistrées bientôt disponibles" type="button">
        <Bookmark aria-hidden="true" />
        <span>Enregistrées</span>
      </button>
      <a href="/contribuer">
        <Plus aria-hidden="true" />
        <span>Contribuer</span>
      </a>
    </nav>
  );
}

function PharmacyDetailContent({
  pharmacy,
  onCall,
}: {
  pharmacy: PublicPharmacy;
  onCall: () => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const duty = describeDuty(pharmacy);
  const source = pharmacy.currentDuty?.source;
  const coordinates = hasValidCoordinates(pharmacy.coordinates)
    ? pharmacy.coordinates
    : undefined;
  const address = [
    pharmacy.address.line,
    pharmacy.address.district,
    pharmacy.address.arrondissement,
  ]
    .filter(Boolean)
    .join(", ");
  const coordinateText = coordinates
    ? `${coordinates.latitude}, ${coordinates.longitude}`
    : undefined;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`${label} copiée${label === "Adresse" ? "" : "s"}.`);
    } catch {
      setCopyFeedback(
        "Copie impossible. Sélectionnez le texte pour le copier.",
      );
    }
  }

  return (
    <>
      <section
        className="pharmacy-detail-map-area"
        aria-label="Localisation sur la carte"
      >
        {coordinates ? (
          <PharmacyDetailMap coordinates={coordinates} name={pharmacy.name} />
        ) : (
          <div className="pharmacy-detail-map-area__missing" role="status">
            Carte indisponible : coordonnées absentes ou invalides.
          </div>
        )}
        <a className="pharmacy-detail-back" href="/#map">
          <ChevronLeft aria-hidden="true" /> Retour à la carte
        </a>
      </section>

      <section
        className="pharmacy-detail-panel"
        aria-label="Fiche de la pharmacie"
      >
        <span aria-hidden="true" className="pharmacy-detail-panel__handle" />
        <div className="pharmacy-detail-identity">
          <div aria-hidden="true" className="pharmacy-detail-identity__mark">
            <Plus />
          </div>
          <div className="pharmacy-detail-identity__text">
            <h1>{pharmacy.name}</h1>
            <Badge
              className={`pharmacy-detail-duty pharmacy-detail-duty--${duty.kind}`}
              variant="secondary"
            >
              <ClockIcon aria-hidden="true" weight="fill" /> {duty.label}
            </Badge>
            {pharmacy.currentDuty ? (
              <p>
                Garde indiquée jusqu’au{" "}
                {formatDateTime(pharmacy.currentDuty.endsAt)}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className="pharmacy-detail-actions"
          aria-label="Actions pour la pharmacie"
        >
          <Button
            className="pharmacy-detail-actions__primary"
            disabled
            title="Itinéraire bientôt disponible"
            type="button"
          >
            <Navigation aria-hidden="true" /> <span>Itinéraire</span>
          </Button>
          {dialablePhone(pharmacy.phone) ? (
            <Button
              asChild
              className="pharmacy-detail-actions__call"
              variant="secondary"
            >
              <a
                href={`tel:${pharmacy.phone.replace(/[\s().-]/g, "")}`}
                onClick={onCall}
              >
                <Phone aria-hidden="true" fill="currentColor" />{" "}
                <span>Appeler</span>
              </a>
            </Button>
          ) : (
            <Button
              className="pharmacy-detail-actions__call"
              disabled
              title="Numéro non renseigné"
              type="button"
              variant="secondary"
            >
              <Phone aria-hidden="true" /> <span>Appeler</span>
            </Button>
          )}
          <Button
            disabled
            title="Enregistrement bientôt disponible"
            type="button"
            variant="secondary"
          >
            <Bookmark aria-hidden="true" /> <span>Enregistrer</span>
          </Button>
          <Button
            disabled
            title="Signalement bientôt disponible"
            type="button"
            variant="secondary"
          >
            <CircleAlert aria-hidden="true" /> <span>Signaler un problème</span>
          </Button>
        </div>
        <p className="pharmacy-detail-actions-note">
          Itinéraire, enregistrement et signalement bientôt disponibles.
        </p>

        <Separator />
        <div className="pharmacy-detail-facts">
          {pharmacy.phone ? (
            <div className="pharmacy-detail-fact">
              <Phone aria-hidden="true" fill="currentColor" />
              <span>{formatPhone(pharmacy.phone)}</span>
            </div>
          ) : (
            <div className="pharmacy-detail-fact pharmacy-detail-fact--muted">
              <Phone aria-hidden="true" /> <span>Numéro non renseigné</span>
            </div>
          )}
          <div className="pharmacy-detail-fact">
            <MapPinIcon aria-hidden="true" weight="fill" />
            <span>
              <strong>
                {pharmacy.address.line || "Adresse non renseignée"}
              </strong>
              <small>
                {[pharmacy.address.district, pharmacy.address.arrondissement]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            {address ? (
              <Button
                aria-label="Copier l’adresse"
                onClick={() => void copy(address, "Adresse")}
                size="icon"
                title="Copier l’adresse"
                type="button"
                variant="ghost"
              >
                <Clipboard aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <div className="pharmacy-detail-fact">
            <BuildingsIcon aria-hidden="true" weight="fill" />
            <span>
              <strong>
                {pharmacy.address.district || "Quartier non renseigné"}
              </strong>
              <small>
                {pharmacy.address.arrondissement
                  ? `Arrondissement ${pharmacy.address.arrondissement}`
                  : "Arrondissement non renseigné"}
              </small>
            </span>
          </div>
          <div className="pharmacy-detail-fact pharmacy-detail-fact--source">
            <ShieldCheck
              aria-hidden="true"
              fill={duty.kind === "fresh" ? "currentColor" : "none"}
            />
            <span>
              {duty.detail}
              {source ? (
                <small>
                  {source.name} · observation du{" "}
                  {formatDateTime(source.observedAt)}
                </small>
              ) : (
                <small>Source non renseignée</small>
              )}
            </span>
          </div>
        </div>
        <Separator />

        <section
          className="pharmacy-detail-useful"
          aria-labelledby="pharmacy-detail-useful-title"
        >
          <h2 id="pharmacy-detail-useful-title">Informations utiles</h2>
          <div className="pharmacy-detail-useful__rows">
            <div className="pharmacy-detail-useful__row">
              <ClockIcon aria-hidden="true" weight="fill" />
              <span>
                <strong>Horaires de garde</strong>
                <small>
                  {pharmacy.currentDuty
                    ? `Jusqu’au ${formatDateTime(pharmacy.currentDuty.endsAt)}`
                    : "Aucun horaire de garde actif renseigné"}
                </small>
              </span>
            </div>
            <div className="pharmacy-detail-useful__row">
              <MapPinIcon aria-hidden="true" weight="fill" />
              <span>
                <strong>Coordonnées GPS</strong>
                <small>{coordinateText ?? "Non renseignées"}</small>
              </span>
              {coordinateText ? (
                <Button
                  aria-label="Copier les coordonnées"
                  onClick={() => void copy(coordinateText, "Coordonnées")}
                  size="icon"
                  title="Copier les coordonnées"
                  type="button"
                  variant="ghost"
                >
                  <Clipboard aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>
        </section>
        <p
          aria-live="polite"
          className="pharmacy-detail-copy-feedback"
          role="status"
        >
          {copyFeedback}
        </p>
      </section>
    </>
  );
}

function PharmacyDetailFallback({
  state,
  onRetry,
}: {
  state: PharmacyDetailState;
  onRetry: () => void;
}) {
  return (
    <section className="pharmacy-detail-fallback">
      <a className="pharmacy-detail-back" href="/#map">
        <ChevronLeft aria-hidden="true" /> Retour à la carte
      </a>
      {state.status === "loading" || state.status === "idle" ? (
        <div
          aria-busy="true"
          aria-label="Chargement de la pharmacie"
          role="status"
        >
          <Skeleton className="pharmacy-detail-fallback__map" />
          <Skeleton className="pharmacy-detail-fallback__title" />
          <Skeleton className="pharmacy-detail-fallback__line" />
          <Skeleton className="pharmacy-detail-fallback__line" />
        </div>
      ) : (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            <h1>
              {state.status === "not-found"
                ? "Pharmacie introuvable"
                : "Fiche indisponible"}
            </h1>
          </AlertTitle>
          <AlertDescription>
            {state.status === "not-found"
              ? "Cette pharmacie n’est pas publiée ou n’existe plus."
              : "Impossible de charger cette pharmacie. Vérifiez votre connexion puis réessayez."}
          </AlertDescription>
          {state.status === "error" ? (
            <Button onClick={onRetry} type="button" variant="outline">
              <RefreshCw aria-hidden="true" /> Réessayer
            </Button>
          ) : null}
        </Alert>
      )}
    </section>
  );
}

export function PharmacyDetailRoute({ id }: { id: string }) {
  const client = useMemo(
    () =>
      createPharmacyDetailClient({
        fetch: (input, init) => window.fetch(input, init),
      }),
    [],
  );
  const analytics = useMemo(
    () => createAnalyticsTransport({ endpoint: "/api/v1/analytics/events" }),
    [],
  );
  const trackedId = useRef<string | null>(null);
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

  useEffect(() => {
    if (state.status === "success" && trackedId.current !== state.pharmacy.id) {
      analytics.track({
        schemaVersion: 1,
        name: "pharmacy_detail_viewed",
        properties: { pharmacyId: state.pharmacy.id },
      });
      trackedId.current = state.pharmacy.id;
    }
  }, [analytics, state]);

  return (
    <main className="pharmacy-detail-page" id="public-content">
      {state.status === "success" ? (
        <PharmacyDetailContent
          onCall={() =>
            analytics.track({
              schemaVersion: 1,
              name: "pharmacy_call_started",
              properties: { pharmacyId: state.pharmacy.id },
            })
          }
          pharmacy={state.pharmacy}
        />
      ) : (
        <PharmacyDetailFallback onRetry={() => void load()} state={state} />
      )}
      <DetailNavigation />
    </main>
  );
}
