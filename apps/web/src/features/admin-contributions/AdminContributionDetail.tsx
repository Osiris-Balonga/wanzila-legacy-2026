import { useEffect, useState, type FormEvent } from "react";
import type { AdminContribution } from "@wanzila/contracts";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Pencil,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminPharmacyLocationMap } from "../admin-pharmacy/AdminPharmacyLocationMap";
import {
  ContributionHttpError,
  contributionError,
  correctContribution,
  decideContribution,
  getContribution,
  redirectIfUnauthenticated,
} from "./client";

type Snapshot = {
  name: string;
  address: { line: string; district: string; arrondissement: string };
  phone?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
  note?: string | null;
};
function snapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    !record.address ||
    typeof record.address !== "object"
  )
    return null;
  const address = record.address as Record<string, unknown>;
  if (
    typeof address.line !== "string" ||
    typeof address.district !== "string" ||
    typeof address.arrondissement !== "string"
  )
    return null;
  const position = record.coordinates;
  const coordinates =
    position &&
    typeof position === "object" &&
    typeof (position as Record<string, unknown>).latitude === "number" &&
    typeof (position as Record<string, unknown>).longitude === "number"
      ? (position as { latitude: number; longitude: number })
      : null;
  return {
    name: record.name,
    address: {
      line: address.line,
      district: address.district,
      arrondissement: address.arrondissement,
    },
    phone: typeof record.phone === "string" ? record.phone : null,
    note: typeof record.note === "string" ? record.note : null,
    coordinates,
  };
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}
function statusLabel(value: AdminContribution["status"]) {
  return value === "PENDING"
    ? "En attente"
    : value === "APPROVED"
      ? "Approuvée"
      : "Rejetée";
}
function coordinatesLabel(
  value: { latitude: number; longitude: number } | null | undefined,
) {
  return value
    ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
    : "Non renseignées";
}

function changes(beforeRaw: unknown, afterRaw: unknown) {
  const before = snapshot(beforeRaw),
    after = snapshot(afterRaw);
  if (!before || !after) return [];
  const values = [
    ["Nom", before.name, after.name],
    ["Adresse", before.address.line, after.address.line],
    ["Quartier", before.address.district, after.address.district],
    [
      "Arrondissement",
      before.address.arrondissement,
      after.address.arrondissement,
    ],
    [
      "Téléphone",
      before.phone ?? "Non renseigné",
      after.phone ?? "Non renseigné",
    ],
    [
      "Position",
      coordinatesLabel(before.coordinates),
      coordinatesLabel(after.coordinates),
    ],
    ["Note", before.note ?? "Aucune", after.note ?? "Aucune"],
  ];
  return values
    .filter(([, oldValue, newValue]) => oldValue !== newValue)
    .map(([label, oldValue, newValue]) => ({ label, oldValue, newValue }));
}

type FormFields = {
  name: string;
  line: string;
  district: string;
  arrondissement: string;
  phone: string;
  latitude: string;
  longitude: string;
  note: string;
  reason: string;
};
function fieldsFrom(item: AdminContribution): FormFields {
  return {
    name: item.name,
    line: item.address.line,
    district: item.address.district,
    arrondissement: item.address.arrondissement,
    phone: item.phone ?? "",
    latitude: item.coordinates ? String(item.coordinates.latitude) : "",
    longitude: item.coordinates ? String(item.coordinates.longitude) : "",
    note: item.note ?? "",
    reason: "",
  };
}

function DuplicateEvidence({ item }: { item: AdminContribution }) {
  const exact = item.duplicates.some(
    (value) =>
      value.target === "PHARMACY" && value.kind === "EXACT_NAME_ADDRESS",
  );
  return (
    <section
      className="admin-contribution__card admin-contribution__duplicates"
      aria-labelledby="duplicate-title"
    >
      <header>
        <ShieldAlert aria-hidden="true" />
        <h2 id="duplicate-title">Rapprochements à vérifier</h2>
      </header>
      {exact && (
        <p className="admin-contribution__warning">
          Une pharmacie présente a le même nom et la même adresse normalisés.
          L’approbation est bloquée jusqu’à correction ou rejet.
        </p>
      )}
      {item.duplicates.length === 0 ? (
        <p>
          Aucun indice de rapprochement dans les données actuelles. Une
          vérification humaine reste nécessaire.
        </p>
      ) : (
        <ul>
          {item.duplicates.map((indicator, index) => {
            const description =
              indicator.kind === "EXACT_NAME_ADDRESS"
                ? "Nom et adresse identiques"
                : indicator.kind === "PHONE"
                  ? "Téléphone identique"
                  : `Position à ${indicator.distanceMeters ?? "?"} m à vol d’oiseau`;
            return (
              <li key={`${indicator.id}-${indicator.kind}-${index}`}>
                <strong>{description}</strong>
                <span>
                  {indicator.target === "PHARMACY"
                    ? "Pharmacie"
                    : "Autre proposition"}
                </span>
                <a
                  href={
                    indicator.target === "PHARMACY"
                      ? `/admin/pharmacies/${indicator.id}`
                      : `/admin/contributions/${indicator.id}`
                  }
                >
                  Voir la fiche liée
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CorrectionForm({
  item,
  onSaved,
  onCancel,
}: {
  item: AdminContribution;
  onSaved: (item: AdminContribution) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(() => fieldsFrom(item));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const update =
    (key: keyof FormFields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const hasLatitude = fields.latitude.trim() !== "";
    const hasLongitude = fields.longitude.trim() !== "";
    if (hasLatitude !== hasLongitude) {
      setError("Renseignez les deux coordonnées ou laissez les deux vides.");
      return;
    }
    const coordinates = hasLatitude
      ? {
          latitude: Number(fields.latitude),
          longitude: Number(fields.longitude),
        }
      : null;
    if (
      coordinates &&
      (!Number.isFinite(coordinates.latitude) ||
        !Number.isFinite(coordinates.longitude) ||
        Math.abs(coordinates.latitude) > 90 ||
        Math.abs(coordinates.longitude) > 180)
    ) {
      setError("Saisissez une latitude et une longitude valides.");
      return;
    }
    const payload = {
      expectedVersion: item.version,
      reason: fields.reason,
      name: fields.name,
      address: {
        line: fields.line,
        district: fields.district,
        arrondissement: fields.arrondissement,
      },
      phone: fields.phone.trim() || null,
      coordinates,
      note: fields.note.trim() || null,
    };
    const changed =
      payload.name.trim() !== item.name ||
      payload.address.line.trim() !== item.address.line ||
      payload.address.district.trim() !== item.address.district ||
      payload.address.arrondissement.trim() !== item.address.arrondissement ||
      payload.phone !== item.phone ||
      payload.note !== item.note ||
      (payload.coordinates?.latitude ?? null) !==
        (item.coordinates?.latitude ?? null) ||
      (payload.coordinates?.longitude ?? null) !==
        (item.coordinates?.longitude ?? null);
    if (!changed) {
      setError(
        "Modifiez au moins une information avant d’enregistrer une correction.",
      );
      return;
    }
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      onSaved(await correctContribution(item.id, payload));
    } catch (caught) {
      if (redirectIfUnauthenticated(caught)) return;
      setError(contributionError(caught));
      setConflict(
        caught instanceof ContributionHttpError && caught.status === 409,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="admin-contribution__card admin-contribution__edit"
      onSubmit={(event) => void submit(event)}
    >
      <header>
        <Pencil aria-hidden="true" />
        <h2>Corriger la proposition</h2>
      </header>
      <p>
        La proposition initiale et chaque correction restent visibles dans
        l’historique.
      </p>
      <div className="admin-contribution__fields">
        <label>
          Nom de la pharmacie
          <Input
            required
            maxLength={180}
            value={fields.name}
            onChange={update("name")}
          />
        </label>
        <label>
          Adresse
          <Input
            required
            maxLength={255}
            value={fields.line}
            onChange={update("line")}
          />
        </label>
        <label>
          Quartier
          <Input
            required
            maxLength={120}
            value={fields.district}
            onChange={update("district")}
          />
        </label>
        <label>
          Arrondissement
          <Input
            required
            maxLength={120}
            value={fields.arrondissement}
            onChange={update("arrondissement")}
          />
        </label>
        <label>
          Téléphone de la pharmacie
          <Input
            maxLength={32}
            value={fields.phone}
            onChange={update("phone")}
          />
        </label>
        <label>
          Latitude
          <Input
            inputMode="decimal"
            value={fields.latitude}
            onChange={update("latitude")}
          />
        </label>
        <label>
          Longitude
          <Input
            inputMode="decimal"
            value={fields.longitude}
            onChange={update("longitude")}
          />
        </label>
        <label className="admin-contribution__wide">
          Note soumise
          <Textarea
            maxLength={200}
            value={fields.note}
            onChange={update("note")}
          />
        </label>
        <label className="admin-contribution__wide">
          Motif de la correction <span aria-hidden="true">*</span>
          <Textarea
            required
            maxLength={500}
            value={fields.reason}
            onChange={update("reason")}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="admin-contribution__error">
          {error}
          {conflict && (
            <>
              {" "}
              <button type="button" onClick={() => window.location.reload()}>
                Recharger la proposition
              </button>
            </>
          )}
        </p>
      )}
      <div className="admin-contribution__form-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Enregistrement…" : "Enregistrer la correction"}
        </Button>
      </div>
    </form>
  );
}

export function AdminContributionDetail({ id }: { id: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "not-found" }
    | { kind: "error"; message: string }
    | { kind: "ready"; item: AdminContribution }
  >({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void getContribution(id)
      .then((item) => {
        if (active) setState({ kind: "ready", item });
      })
      .catch((error) => {
        if (!active || redirectIfUnauthenticated(error)) return;
        if (error instanceof ContributionHttpError && error.status === 404)
          setState({ kind: "not-found" });
        else setState({ kind: "error", message: contributionError(error) });
      });
    return () => {
      active = false;
    };
  }, [id, retry]);

  const decide = async (
    action: "approve" | "reject",
    item: AdminContribution,
  ) => {
    if (pendingAction) return;
    setPendingAction(action);
    setDecisionError(null);
    setStale(false);
    try {
      const updated = await decideContribution(item.id, action, {
        expectedVersion: item.version,
        reason,
        ...(action === "approve"
          ? { confirmPossibleDuplicate: confirmDuplicate }
          : {}),
      });
      setState({ kind: "ready", item: updated });
      setReason("");
      setConfirmDuplicate(false);
    } catch (error) {
      if (redirectIfUnauthenticated(error)) return;
      setDecisionError(contributionError(error));
      setStale(
        error instanceof ContributionHttpError &&
          error.status === 409 &&
          error.message.includes("changed"),
      );
    } finally {
      setPendingAction(null);
    }
  };

  if (state.kind === "loading")
    return (
      <p className="admin-contribution__notice" role="status">
        Chargement de la contribution…
      </p>
    );
  if (state.kind === "not-found")
    return (
      <div className="admin-contribution__notice">
        <h1>Contribution introuvable</h1>
        <a href="/admin/contributions">Retour à la liste</a>
      </div>
    );
  if (state.kind === "error")
    return (
      <div className="admin-contribution__notice" role="alert">
        <p>{state.message}</p>
        <Button
          onClick={() => setRetry((value) => value + 1)}
          variant="outline"
        >
          Réessayer
        </Button>
      </div>
    );
  const item = state.item;
  const original = snapshot(item.original);
  const exactExisting = item.duplicates.some(
    (value) =>
      value.target === "PHARMACY" && value.kind === "EXACT_NAME_ADDRESS",
  );
  const canApprove =
    Boolean(item.coordinates) &&
    !exactExisting &&
    (!item.duplicates.length || confirmDuplicate);
  return (
    <article
      className="admin-contribution"
      aria-labelledby="contribution-title"
    >
      <a className="admin-contribution__back" href="/admin/contributions">
        <ArrowLeft aria-hidden="true" /> Retour aux contributions
      </a>
      <header className="admin-contribution__heading">
        <div>
          <p className="overline">Revue d’une proposition</p>
          <h1 id="contribution-title">
            {item.name}{" "}
            <span
              className={`admin-contributions__status admin-contributions__status--${item.status.toLowerCase()}`}
            >
              {statusLabel(item.status)}
            </span>
          </h1>
          <p>
            Vérifiez les informations, la position et les rapprochements avant
            de décider.
          </p>
        </div>
        <p className="admin-contribution__date">
          Soumise le {dateLabel(item.createdAt)}
        </p>
      </header>
      <div className="admin-contribution__grid">
        <div className="admin-contribution__column">
          <section
            className="admin-contribution__card"
            aria-labelledby="submitted-title"
          >
            <header>
              <ClipboardCheck aria-hidden="true" />
              <h2 id="submitted-title">Informations actuelles</h2>
            </header>
            <dl className="admin-contribution__info">
              <div>
                <dt>Nom</dt>
                <dd>{item.name}</dd>
              </div>
              <div>
                <dt>Téléphone de la pharmacie</dt>
                <dd>{item.phone ?? "Non renseigné"}</dd>
              </div>
              <div>
                <dt>Adresse</dt>
                <dd>{item.address.line}</dd>
              </div>
              <div>
                <dt>Quartier</dt>
                <dd>{item.address.district}</dd>
              </div>
              <div>
                <dt>Arrondissement</dt>
                <dd>{item.address.arrondissement}</dd>
              </div>
              <div>
                <dt>Coordonnées</dt>
                <dd>{coordinatesLabel(item.coordinates)}</dd>
              </div>
              <div>
                <dt>Note</dt>
                <dd>{item.note || "Aucune note conservée"}</dd>
              </div>
            </dl>
          </section>
          <section
            className="admin-contribution__card"
            aria-labelledby="history-title"
          >
            <header>
              <Pencil aria-hidden="true" />
              <h2 id="history-title">Original et historique</h2>
            </header>
            {original ? (
              <div className="admin-contribution__original">
                <strong>Proposition initiale</strong>
                <p>
                  {original.name} · {original.address.line},{" "}
                  {original.address.district}, {original.address.arrondissement}
                </p>
                <p>Position : {coordinatesLabel(original.coordinates)}</p>
                <p>Note : {original.note || "Aucune note conservée"}</p>
              </div>
            ) : (
              <p>Original non enregistré pour cette ancienne contribution.</p>
            )}
            {item.corrections.length ? (
              <ol className="admin-contribution__history">
                {item.corrections.map((change) => (
                  <li key={change.version}>
                    <strong>
                      Correction v{change.version} · {change.correctedByName}
                    </strong>
                    <small>{dateLabel(change.createdAt)}</small>
                    <p>{change.reason}</p>
                    {changes(change.before, change.after).map((diff) => (
                      <p key={diff.label}>
                        <b>{diff.label} :</b> {diff.oldValue} → {diff.newValue}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Aucune correction enregistrée.</p>
            )}
            {item.reviewedAt && (
              <p className="admin-contribution__decision-history">
                <strong>Décision : {statusLabel(item.status)}</strong> ·{" "}
                {item.reviewedByName ?? "Identité non renseignée"} ·{" "}
                {dateLabel(item.reviewedAt)}
                <br />
                {item.reviewNote}
              </p>
            )}
            {item.pharmacyId && (
              <a href={`/admin/pharmacies/${item.pharmacyId}`}>
                Voir la pharmacie créée en brouillon
              </a>
            )}
          </section>
        </div>
        <div className="admin-contribution__column">
          <section
            className="admin-contribution__card"
            aria-labelledby="location-title"
          >
            <header>
              <MapPin aria-hidden="true" />
              <h2 id="location-title">Localisation proposée</h2>
            </header>
            {item.coordinates ? (
              <>
                <AdminPharmacyLocationMap
                  name={item.name}
                  coordinates={item.coordinates}
                />
                <p className="admin-contribution__coords">
                  {coordinatesLabel(item.coordinates)} · Position proposée, à
                  vérifier sur place.
                </p>
              </>
            ) : (
              <p className="admin-contribution__missing-position">
                Aucune position soumise. Renseignez des coordonnées vérifiées
                dans une correction avant l’approbation.
              </p>
            )}
          </section>
          <DuplicateEvidence item={item} />
        </div>
      </div>
      {item.status === "PENDING" &&
        (editing ? (
          <CorrectionForm
            item={item}
            onSaved={(updated) => {
              setState({ kind: "ready", item: updated });
              setEditing(false);
              setDecisionError(null);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <section
            className="admin-contribution__decision admin-contribution__card"
            aria-labelledby="decision-title"
          >
            <div>
              <h2 id="decision-title">Décision de revue</h2>
              <p>
                L’approbation crée une pharmacie brouillon. Sa publication est
                une action admin distincte.
              </p>
            </div>
            <label className="admin-contribution__reason">
              Motif de la décision <span aria-hidden="true">*</span>
              <Textarea
                required
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Expliquez la vérification ou le rejet"
              />
            </label>
            {item.duplicates.length > 0 && !exactExisting && (
              <label className="admin-contribution__confirm">
                <input
                  type="checkbox"
                  checked={confirmDuplicate}
                  onChange={(event) =>
                    setConfirmDuplicate(event.target.checked)
                  }
                />
                <span>
                  J’ai examiné les {item.duplicates.length} indice
                  {item.duplicates.length > 1 ? "s" : ""} de rapprochement et
                  confirme qu’il s’agit d’une nouvelle pharmacie.
                </span>
              </label>
            )}
            {!item.coordinates && (
              <p className="admin-contribution__warning">
                Une position valide est nécessaire avant l’approbation.
              </p>
            )}
            {decisionError && (
              <p className="admin-contribution__error" role="alert">
                {decisionError}
                {stale && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => {
                        setRetry((value) => value + 1);
                        setStale(false);
                      }}
                    >
                      Recharger la proposition
                    </button>
                  </>
                )}
              </p>
            )}
            <div className="admin-contribution__decision-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" /> Corriger
              </Button>
              <Button
                type="button"
                disabled={
                  !reason.trim() || !canApprove || pendingAction !== null
                }
                onClick={() => void decide("approve", item)}
              >
                <CheckCircle2 aria-hidden="true" />{" "}
                {pendingAction === "approve"
                  ? "Approbation…"
                  : "Approuver en brouillon"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!reason.trim() || pendingAction !== null}
                onClick={() => void decide("reject", item)}
              >
                <XCircle aria-hidden="true" />{" "}
                {pendingAction === "reject" ? "Rejet…" : "Rejeter"}
              </Button>
            </div>
          </section>
        ))}
    </article>
  );
}
