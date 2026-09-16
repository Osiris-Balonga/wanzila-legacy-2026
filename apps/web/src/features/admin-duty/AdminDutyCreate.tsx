import type { AdminPharmacy, AdminScheduleSource } from "@wanzila/contracts";
import { CalendarIcon } from "@phosphor-icons/react/Calendar";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { EyeIcon } from "@phosphor-icons/react/Eye";
import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import { ArrowLeft, Save, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createDuty,
  DutyHttpError,
  isDutyAuthError,
  listPharmacies,
  listSources,
} from "./admin-duty-client";
import { DutyAuthNotice } from "./DutyAuthNotice";
import { DutyLocationMap } from "./DutyLocationMap";

type OptionsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      pharmacies: AdminPharmacy[];
      sources: AdminScheduleSource[];
    }
  | { kind: "error" };

function instant(date: string, time: string): string | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function distinctAddressParts(...parts: string[]): string {
  const seen = new Set<string>();
  return parts
    .filter((part) => {
      const normalized = part.trim().toLocaleLowerCase("fr-CG");
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(", ");
}

function durationLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt || !endsAt) return "À définir";
  const hours = (Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000;
  if (hours <= 0) return "Période invalide";
  return `${new Intl.NumberFormat("fr-CG", { maximumFractionDigits: 1 }).format(hours)} heures`;
}

function datePreview(value: string | null): string {
  if (!value) return "À définir";
  return new Intl.DateTimeFormat("fr-CG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

export function AdminDutyCreate() {
  const [options, setOptions] = useState<OptionsState>({ kind: "loading" });
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const submissionLockedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listPharmacies(), listSources()])
      .then(([pharmacies, sources]) => {
        if (!cancelled) setOptions({ kind: "ready", pharmacies, sources });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        if (isDutyAuthError(failure)) setAuthRequired(true);
        else setOptions({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pharmacy =
    options.kind === "ready"
      ? options.pharmacies.find((item) => item.id === pharmacyId)
      : undefined;
  const source =
    options.kind === "ready"
      ? options.sources.find((item) => item.id === sourceId)
      : undefined;
  const startsAt = instant(startDate, startTime);
  const endsAt = instant(endDate, endTime);

  function changePayload(update: () => void) {
    if (saved) {
      setSaved(false);
      submissionLockedRef.current = false;
    }
    update();
  }

  async function searchPharmacies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (options.kind !== "ready") return;
    try {
      const pharmacies = await listPharmacies(pharmacySearch);
      setOptions({ ...options, pharmacies });
      if (!pharmacies.some((item) => item.id === pharmacyId)) {
        changePayload(() => setPharmacyId(""));
      }
    } catch (failure) {
      if (isDutyAuthError(failure)) setAuthRequired(true);
      else setError("La recherche de pharmacies est indisponible.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLockedRef.current) return;
    setError("");
    setSaved(false);
    if (!pharmacyId || !startsAt || !endsAt) {
      setError(
        "Choisissez une pharmacie et renseignez les dates et heures de début et de fin.",
      );
      return;
    }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("La fin doit être après le début.");
      return;
    }
    submissionLockedRef.current = true;
    setSaving(true);
    let completed = false;
    try {
      const duty = await createDuty({
        pharmacyId,
        sourceId: sourceId || null,
        startsAt,
        endsAt,
      });
      if (duty.status !== "PENDING") {
        setError(
          "La réponse du serveur ne confirme pas une garde en attente. Vérifiez son état dans la liste.",
        );
        return;
      }
      completed = true;
      setSaved(true);
    } catch (failure) {
      if (isDutyAuthError(failure)) setAuthRequired(true);
      else {
        setError(
          failure instanceof DutyHttpError && failure.status === 409
            ? "Conflit de garde : la période n’a pas été enregistrée."
            : "La garde n’a pas pu être enregistrée. Vérifiez les données et réessayez.",
        );
      }
    } finally {
      if (!completed) submissionLockedRef.current = false;
      setSaving(false);
    }
  }

  if (authRequired) {
    return (
      <div className="admin-duty admin-duty--create">
        <header className="admin-duty__heading">
          <h1>Créer une garde</h1>
        </header>
        <DutyAuthNotice />
      </div>
    );
  }

  return (
    <div className="admin-duty admin-duty--create">
      <a className="admin-duty__back" href="/admin/gardes">
        <ArrowLeft aria-hidden="true" />
        Retour aux gardes
      </a>
      <header className="admin-duty__heading">
        <div>
          <h1>Créer une garde</h1>
          <p>Planifiez une nouvelle période de garde pour une pharmacie.</p>
        </div>
      </header>
      <div className="admin-duty__create-grid">
        <section
          aria-label="Informations de la garde"
          className="admin-duty__form-panel"
        >
          <div className="admin-duty__panel-heading">
            <span className="admin-duty__panel-icon" aria-hidden="true">
              <CalendarIcon weight="fill" />
            </span>
            <div>
              <h2>Informations de la garde</h2>
              <p>Renseignez les informations nécessaires à la création.</p>
            </div>
          </div>
          {options.kind === "loading" ? (
            <div role="status">
              <span>Chargement des pharmacies et sources…</span>
              <Skeleton className="admin-duty__form-skeleton" />
            </div>
          ) : options.kind === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Informations indisponibles</AlertTitle>
              <AlertDescription>
                Les pharmacies ou les sources ne peuvent pas être chargées pour
                le moment.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <form
                className="admin-duty__pharmacy-search"
                onSubmit={(event) => void searchPharmacies(event)}
                role="search"
              >
                <Label htmlFor="admin-duty-pharmacy-search">
                  Rechercher dans les pharmacies
                </Label>
                <div>
                  <Input
                    id="admin-duty-pharmacy-search"
                    onChange={(event) => setPharmacySearch(event.target.value)}
                    placeholder="Nom de la pharmacie"
                    type="search"
                    value={pharmacySearch}
                  />
                  <Button
                    aria-label="Chercher une pharmacie"
                    type="submit"
                    variant="outline"
                  >
                    <Search aria-hidden="true" />
                  </Button>
                </div>
              </form>
              <form
                className="admin-duty__form"
                onSubmit={(event) => void submit(event)}
                noValidate
              >
                <div className="admin-duty__field">
                  <Label htmlFor="admin-duty-pharmacy">
                    Pharmacie <span aria-hidden="true">*</span>
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      changePayload(() => setPharmacyId(value))
                    }
                    value={pharmacyId}
                  >
                    <SelectTrigger
                      aria-label="Pharmacie"
                      id="admin-duty-pharmacy"
                    >
                      <SelectValue placeholder="Sélectionner une pharmacie" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.pharmacies.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {options.pharmacies.length === 0 ? (
                    <small>
                      Aucune pharmacie trouvée. Essayez un autre nom.
                    </small>
                  ) : null}
                </div>
                <div className="admin-duty__date-grid">
                  <div className="admin-duty__field">
                    <Label htmlFor="admin-duty-start-date">
                      Date de début <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="admin-duty-start-date"
                      onChange={(event) =>
                        changePayload(() => setStartDate(event.target.value))
                      }
                      type="date"
                      value={startDate}
                    />
                  </div>
                  <div className="admin-duty__field">
                    <Label htmlFor="admin-duty-start-time">
                      Heure de début <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="admin-duty-start-time"
                      onChange={(event) =>
                        changePayload(() => setStartTime(event.target.value))
                      }
                      type="time"
                      value={startTime}
                    />
                  </div>
                  <div className="admin-duty__field">
                    <Label htmlFor="admin-duty-end-date">
                      Date de fin <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="admin-duty-end-date"
                      onChange={(event) =>
                        changePayload(() => setEndDate(event.target.value))
                      }
                      type="date"
                      value={endDate}
                    />
                  </div>
                  <div className="admin-duty__field">
                    <Label htmlFor="admin-duty-end-time">
                      Heure de fin <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="admin-duty-end-time"
                      onChange={(event) =>
                        changePayload(() => setEndTime(event.target.value))
                      }
                      type="time"
                      value={endTime}
                    />
                  </div>
                </div>
                <div className="admin-duty__field">
                  <Label htmlFor="admin-duty-source">Source du planning</Label>
                  <Select
                    onValueChange={(value) =>
                      changePayload(() =>
                        setSourceId(value === "none" ? "" : value),
                      )
                    }
                    value={sourceId || "none"}
                  >
                    <SelectTrigger
                      aria-label="Source du planning"
                      id="admin-duty-source"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sans source</SelectItem>
                      {options.sources.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {source ? (
                    <small>
                      {source.freshness === "FRESH"
                        ? "Source actualisée"
                        : "Source ancienne — vérifiez les informations avant approbation."}
                    </small>
                  ) : (
                    <small>
                      La source est facultative selon le contrat actuel.
                    </small>
                  )}
                </div>
                {error ? (
                  <p className="admin-duty__alert" role="alert">
                    {error}
                  </p>
                ) : null}
                {saved ? (
                  <p className="admin-duty__success" role="status">
                    Garde enregistrée en attente d’approbation. Elle n’est pas
                    encore publiée.{" "}
                    <a href="/admin/gardes">Voir la liste des gardes</a>
                  </p>
                ) : null}
                <div className="admin-duty__form-actions">
                  <Button asChild variant="outline">
                    <a href="/admin/gardes">Annuler</a>
                  </Button>
                  <Button
                    className="admin-duty__primary-action"
                    disabled={saving || saved}
                    type="submit"
                  >
                    <Save aria-hidden="true" />
                    {saving ? "Enregistrement…" : "Enregistrer la garde"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>

        <aside
          aria-label="Aperçu de la garde"
          className="admin-duty__preview-panel"
        >
          <div className="admin-duty__panel-heading">
            <span className="admin-duty__panel-icon" aria-hidden="true">
              <EyeIcon weight="fill" />
            </span>
            <div>
              <h2>Aperçu de la garde</h2>
              <p>Données sélectionnées, avant approbation.</p>
            </div>
          </div>
          <Card className="admin-duty__preview-card">
            <CardContent>
              <strong>
                {pharmacy?.name ?? "Aucune pharmacie sélectionnée"}
              </strong>
              {pharmacy ? (
                <p>
                  {distinctAddressParts(
                    pharmacy.address.district,
                    pharmacy.address.arrondissement,
                  )}
                </p>
              ) : null}
              <Badge variant="secondary">
                En attente d’approbation après enregistrement
              </Badge>
              <div className="admin-duty__preview-facts">
                <div>
                  <CalendarIcon aria-hidden="true" weight="fill" />
                  <span>
                    Début<strong>{datePreview(startsAt)}</strong>
                  </span>
                </div>
                <div>
                  <CalendarIcon aria-hidden="true" weight="fill" />
                  <span>
                    Fin<strong>{datePreview(endsAt)}</strong>
                  </span>
                </div>
                <div>
                  <ClockIcon aria-hidden="true" weight="fill" />
                  <span>
                    Durée<strong>{durationLabel(startsAt, endsAt)}</strong>
                  </span>
                </div>
                <div>
                  <FileTextIcon aria-hidden="true" weight="fill" />
                  <span>
                    Source<strong>{source?.name ?? "Sans source"}</strong>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          {pharmacy ? (
            <Card className="admin-duty__location-card">
              <CardContent>
                <DutyLocationMap pharmacy={pharmacy} />
                <p>
                  <MapPinIcon aria-hidden="true" weight="fill" />
                  {distinctAddressParts(
                    pharmacy.address.line,
                    pharmacy.address.district,
                    pharmacy.address.arrondissement,
                  )}
                </p>
              </CardContent>
            </Card>
          ) : null}
          <Alert className="admin-duty__info" role="note">
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>
              L’enregistrement crée une période en attente. Une approbation
              distincte est nécessaire avant toute visibilité publique.
            </AlertDescription>
          </Alert>
        </aside>
      </div>
    </div>
  );
}
