import { useEffect, useState } from "react";
import type { AdminPharmacy } from "@wanzila/contracts";
import { adminPharmacyResponseSchema } from "@wanzila/contracts";
import {
  ArrowLeft,
  ArrowUpRight,
  Archive,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  History,
  MapPin,
  Pencil,
  Phone,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PharmacyPhoto } from "@/components/PharmacyPhoto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminPharmacyLocationMap } from "./AdminPharmacyLocationMap";
import "./admin-pharmacy-detail.css";

type DetailState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; pharmacy: AdminPharmacy };

function coordinatesAreValid(coordinates: AdminPharmacy["coordinates"]) {
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    Math.abs(coordinates.latitude) <= 90 &&
    Math.abs(coordinates.longitude) <= 180
  );
}

function statusLabel(status: AdminPharmacy["status"]) {
  if (status === "DRAFT") return "Brouillon";
  if (status === "PUBLISHED") return "Publiée";
  return "Archivée";
}

function InformationRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-detail__row">
      <dt>
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function AdminPharmacyDetail({ id }: { id: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void fetch(`/api/v1/admin/pharmacies/${id}`, { credentials: "include" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          window.location.assign("/admin/connexion");
          return;
        }
        if (response.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        if (!response.ok) {
          setState({
            kind: "error",
            message:
              response.status === 403
                ? "Vous n’avez pas l’autorisation requise."
                : "Impossible de charger la pharmacie. Réessayez.",
          });
          return;
        }
        const result = adminPharmacyResponseSchema.parse(await response.json());
        if (active) setState({ kind: "ready", pharmacy: result.data });
      })
      .catch(() => {
        if (active)
          setState({
            kind: "error",
            message: "Impossible de charger la pharmacie. Réessayez.",
          });
      });
    return () => {
      active = false;
    };
  }, [id, retry]);

  const transition = async (action: "publish" | "archive") => {
    if (pending) return;
    setPending(true);
    setMutationError(null);
    try {
      const response = await fetch(`/api/v1/admin/pharmacies/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.assign("/admin/connexion");
        return;
      }
      if (!response.ok) {
        setMutationError(
          response.status === 409
            ? "Cette transition n’est plus possible. Rechargez la fiche."
            : "Impossible de modifier le statut. Réessayez.",
        );
        return;
      }
      const result = adminPharmacyResponseSchema.parse(await response.json());
      setState({ kind: "ready", pharmacy: result.data });
    } catch {
      setMutationError("Impossible de modifier le statut. Réessayez.");
    } finally {
      setPending(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <section
        className="admin-detail admin-detail--state"
        aria-label="Fiche pharmacie"
      >
        <p aria-label="Chargement de la pharmacie" role="status">
          Chargement de la pharmacie…
        </p>
        <div aria-hidden="true" className="admin-detail__skeleton" />
        <div
          aria-hidden="true"
          className="admin-detail__skeleton admin-detail__skeleton--large"
        />
      </section>
    );
  }

  if (state.kind !== "ready") {
    return (
      <section className="admin-detail admin-detail--state">
        <a className="admin-detail__back" href="/admin/pharmacies">
          <ArrowLeft aria-hidden="true" /> Retour aux pharmacies
        </a>
        {state.kind === "not-found" ? (
          <>
            <h1>Pharmacie introuvable</h1>
            <p>Cette fiche n’existe pas ou n’est plus disponible.</p>
          </>
        ) : (
          <>
            <h1>Fiche indisponible</h1>
            <p role="alert">{state.message}</p>
            <Button onClick={() => setRetry((value) => value + 1)}>
              Réessayer
            </Button>
          </>
        )}
      </section>
    );
  }

  const { pharmacy } = state;
  const validCoordinates = coordinatesAreValid(pharmacy.coordinates);
  const coordinateText = `${pharmacy.coordinates.latitude}, ${pharmacy.coordinates.longitude}`;
  const destination = `${pharmacy.coordinates.latitude},${pharmacy.coordinates.longitude}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const updatedAt = new Intl.DateTimeFormat("fr-CG", {
    dateStyle: "long",
  }).format(new Date(pharmacy.updatedAt));
  const formattedVerification = pharmacy.recordProvenance
    ? new Intl.DateTimeFormat("fr-CG", { dateStyle: "long" }).format(
        new Date(pharmacy.recordProvenance.verifiedAt),
      )
    : null;

  return (
    <article className="admin-detail">
      <a className="admin-detail__back" href="/admin/pharmacies">
        <ArrowLeft aria-hidden="true" /> Retour aux pharmacies
      </a>
      <header className="admin-detail__heading">
        <div>
          <h1>Fiche pharmacie</h1>
          <p>Détails et informations de la pharmacie.</p>
        </div>
        <div className="admin-detail__actions">
          <Button asChild variant="outline">
            <a href={`/admin/pharmacies/${id}/modifier`}>
              <Pencil aria-hidden="true" /> Modifier
            </a>
          </Button>
          {pharmacy.status === "DRAFT" && (
            <Button
              disabled={pending}
              onClick={() => void transition("publish")}
              variant="outline"
            >
              Publier
            </Button>
          )}
          {pharmacy.status !== "ARCHIVED" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending} variant="destructive">
                  <Archive aria-hidden="true" /> Archiver
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Archiver cette pharmacie ?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Elle ne sera plus visible dans l’annuaire public.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void transition("archive")}
                  >
                    Archiver
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button asChild>
            <a href="/admin/gardes/nouvelle">
              <CalendarDays aria-hidden="true" /> Ajouter une garde
            </a>
          </Button>
        </div>
      </header>
      {mutationError && (
        <p className="admin-detail__feedback" role="alert">
          {mutationError}
        </p>
      )}
      <div className="admin-detail__columns">
        <section
          aria-label="Informations"
          className="admin-detail__panel admin-detail__information"
        >
          <div className="admin-detail__identity">
            <PharmacyPhoto
              className="admin-detail__identity-icon"
              name={pharmacy.name}
              photo={pharmacy.photo}
              fallback={<Store />}
            />
            <div className="admin-detail__identity-copy">
              <h2 id="admin-detail-information">{pharmacy.name}</h2>
              <p>{pharmacy.address.district}</p>
              <small>ID {pharmacy.id}</small>
            </div>
            <div
              className={`admin-detail__status admin-detail__status--${pharmacy.status.toLowerCase()}`}
            >
              <strong>{statusLabel(pharmacy.status)}</strong>
              <small>
                {pharmacy.status === "PUBLISHED"
                  ? "Visible selon les règles de publication"
                  : pharmacy.status === "DRAFT"
                    ? "Non publiée"
                    : "Retirée de l’annuaire public"}
              </small>
            </div>
          </div>
          <h3 className="admin-detail__section-title">Informations</h3>
          <dl className="admin-detail__rows">
            <InformationRow icon={Store} label="Nom">
              {pharmacy.name}
            </InformationRow>
            <InformationRow icon={Phone} label="Téléphone">
              {pharmacy.phone ? (
                <a href={`tel:${pharmacy.phone.replace(/[^+\d]/g, "")}`}>
                  {pharmacy.phone}
                </a>
              ) : (
                "Non renseigné"
              )}
            </InformationRow>
            <InformationRow icon={MapPin} label="Adresse">
              {pharmacy.address.line}
            </InformationRow>
            <InformationRow icon={MapPin} label="Quartier">
              {pharmacy.address.district}
            </InformationRow>
            <InformationRow icon={Building2} label="Arrondissement">
              {pharmacy.address.arrondissement}
            </InformationRow>
            <InformationRow icon={MapPin} label="Coordonnées GPS">
              {validCoordinates ? coordinateText : "Indisponibles"}
            </InformationRow>
            <InformationRow icon={CalendarDays} label="Dernière modification">
              <time dateTime={pharmacy.updatedAt}>{updatedAt}</time>
            </InformationRow>
            <InformationRow icon={Store} label="Source de la fiche">
              {pharmacy.recordProvenance?.source ?? "Non renseignée"}
            </InformationRow>
            <InformationRow icon={CalendarDays} label="Dernière vérification">
              {pharmacy.recordProvenance && formattedVerification ? (
                <time dateTime={pharmacy.recordProvenance.verifiedAt}>
                  {formattedVerification}
                </time>
              ) : (
                "Non renseignée"
              )}
            </InformationRow>
            <InformationRow icon={Store} label="Photo de la pharmacie">
              {pharmacy.photo ? (
                <>
                  {pharmacy.photo.credit} · {pharmacy.photo.source} · droits :{" "}
                  {pharmacy.photo.rights}
                </>
              ) : (
                "Aucune photo validée"
              )}
            </InformationRow>
          </dl>
        </section>
        <section
          aria-labelledby="admin-detail-location"
          className="admin-detail__panel admin-detail__location"
        >
          <div className="admin-detail__panel-heading">
            <h2 id="admin-detail-location">Localisation</h2>
            {validCoordinates && (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                Voir l’itinéraire <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
          {validCoordinates ? (
            <AdminPharmacyLocationMap
              name={pharmacy.name}
              coordinates={pharmacy.coordinates}
            />
          ) : (
            <p className="admin-detail__map-unavailable">
              Carte indisponible : coordonnées invalides.
            </p>
          )}
          <div className="admin-detail__address">
            <span aria-hidden="true">
              <MapPin />
            </span>
            <div>
              <strong>Adresse complète</strong>
              <p>
                {pharmacy.address.line}
                <br />
                {pharmacy.address.district}, {pharmacy.address.arrondissement}
                <br />
                Brazzaville, République du Congo
              </p>
            </div>
          </div>
          <div className="admin-detail__location-footer">
            <div>
              <strong>Coordonnées GPS</strong>
              <span>{validCoordinates ? coordinateText : "Indisponibles"}</span>
            </div>
            {validCoordinates && (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                Ouvrir dans Maps <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
        </section>
      </div>
      <div className="admin-detail__lower-grid">
        <section
          aria-labelledby="admin-detail-history"
          className="admin-detail__panel admin-detail__unavailable-panel"
        >
          <h2 id="admin-detail-history">Historique et dernières activités</h2>
          <div className="admin-detail__unavailable">
            <span aria-hidden="true" className="admin-detail__unavailable-icon">
              <History />
            </span>
            <div>
              <strong>Historique indisponible</strong>
              <p>
                Les événements de cette pharmacie ne sont pas fournis par l’API
                actuelle.
              </p>
            </div>
          </div>
        </section>
        <section
          aria-labelledby="admin-detail-statistics"
          className="admin-detail__panel admin-detail__unavailable-panel"
        >
          <h2 id="admin-detail-statistics">Statistiques rapides</h2>
          <div className="admin-detail__unavailable">
            <span aria-hidden="true" className="admin-detail__unavailable-icon">
              <ChartNoAxesCombined />
            </span>
            <div>
              <strong>Statistiques indisponibles</strong>
              <p>
                Les chiffres d’appels, de gardes, de recherches et de notes ne
                sont pas fournis par l’API actuelle.
              </p>
            </div>
          </div>
        </section>
      </div>
      <p className="admin-detail__data-note">
        La source et la date de vérification de la fiche sont indiquées
        uniquement lorsqu’elles ont été renseignées. Aucune disponibilité n’est
        déduite du statut de publication.
      </p>
    </article>
  );
}
