import type { AdminScheduleSource } from "@wanzila/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DutyAuthNotice } from "./DutyAuthNotice";
import {
  DutyHttpError,
  isDutyAuthError,
  listSources,
  saveSource,
} from "./admin-duty-client";
import { dateLabel, localParts, toInstant } from "./admin-duty-edit-format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; sources: AdminScheduleSource[] }
  | { kind: "auth" | "forbidden" | "error" };

type Fields = {
  name: string;
  description: string;
  reliability: string;
  date: string;
  time: string;
};

const emptyFields: Fields = {
  name: "",
  description: "",
  reliability: "",
  date: "",
  time: "",
};

export function AdminDutySources() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listSources()
      .then((sources) => {
        if (!cancelled) setState({ kind: "ready", sources });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setState({
          kind: isDutyAuthError(failure)
            ? "auth"
            : failure instanceof DutyHttpError && failure.status === 403
              ? "forbidden"
              : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function edit(source: AdminScheduleSource) {
    const observed = localParts(source.observedAt);
    setEditingId(source.id);
    setFields({
      name: source.name,
      description: source.description ?? "",
      reliability: String(source.reliability),
      date: observed.date,
      time: observed.time,
    });
    setError("");
    setFeedback("");
    document.getElementById("duty-source-name")?.focus();
  }

  function resetForm() {
    setEditingId(null);
    setFields(emptyFields);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setFeedback("");
    const observedAt = toInstant(fields.date, fields.time);
    const reliability = fields.reliability.trim()
      ? Number(fields.reliability)
      : undefined;
    if (!fields.name.trim() || !observedAt) {
      setError("Renseignez le nom et la date d’observation de la source.");
      return;
    }
    if (Date.parse(observedAt) > Date.now()) {
      setError("La date d’observation ne peut pas être dans le futur.");
      return;
    }
    if (
      reliability !== undefined &&
      (!Number.isInteger(reliability) || reliability < 0 || reliability > 100)
    ) {
      setError("La fiabilité doit être un entier de 0 à 100.");
      return;
    }
    setBusy(true);
    try {
      await saveSource(
        {
          name: fields.name.trim(),
          ...(editingId
            ? { description: fields.description.trim() || null }
            : fields.description.trim()
              ? { description: fields.description.trim() }
              : {}),
          ...(reliability === undefined ? {} : { reliability }),
          observedAt,
        },
        editingId ?? undefined,
      );
      setFeedback(editingId ? "Source mise à jour." : "Source créée.");
      resetForm();
      setReload((value) => value + 1);
    } catch (failure) {
      if (isDutyAuthError(failure)) setState({ kind: "auth" });
      else if (failure instanceof DutyHttpError && failure.status === 403)
        setState({ kind: "forbidden" });
      else if (failure instanceof DutyHttpError && failure.status === 409) {
        setEditingId(null);
        setFields(emptyFields);
        setError("Cette source a changé. Les données ont été rechargées.");
        setReload((value) => value + 1);
      } else
        setError(
          "La source n’a pas pu être enregistrée. Vérifiez les données.",
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-duty admin-duty-operations">
      <a className="admin-duty__back" href="/admin/gardes">
        Retour aux gardes
      </a>
      <header className="admin-duty__heading">
        <div>
          <h1>Sources des plannings</h1>
          <p>Enregistrez la provenance et la date d’observation des gardes.</p>
        </div>
      </header>
      {state.kind === "auth" ? <DutyAuthNotice /> : null}
      {state.kind === "forbidden" ? (
        <Alert role="alert">
          <AlertDescription>Accès refusé.</AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "error" ? (
        <Alert role="alert">
          <AlertDescription>
            Sources indisponibles.{" "}
            <Button
              onClick={() => {
                setState({ kind: "loading" });
                setReload((value) => value + 1);
              }}
              type="button"
              variant="outline"
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "loading" ? (
        <p role="status">Chargement des sources…</p>
      ) : null}
      {state.kind === "ready" ? (
        <div className="admin-duty-operations__grid">
          <section
            aria-label="Liste des sources"
            className="admin-duty__list-panel"
          >
            <h2>Sources enregistrées</h2>
            {state.sources.length ? (
              <ul className="admin-duty-operations__list">
                {state.sources.map((source) => (
                  <li key={source.id}>
                    <div>
                      <strong>{source.name}</strong>
                      <span>
                        {source.freshness === "FRESH"
                          ? "Source actualisée"
                          : "Source ancienne"}{" "}
                        · Observée le {dateLabel(source.observedAt)}
                      </span>
                      <span>
                        Fiabilité renseignée : {source.reliability}/100
                      </span>
                    </div>
                    <Button
                      aria-label={`Modifier ${source.name}`}
                      onClick={() => edit(source)}
                      type="button"
                      variant="outline"
                    >
                      Modifier
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucune source enregistrée.</p>
            )}
          </section>
          <section
            aria-label="Formulaire de source"
            className="admin-duty__form-panel"
          >
            <h2>{editingId ? "Modifier une source" : "Ajouter une source"}</h2>
            <p>La fraîcheur est calculée à partir de la date d’observation.</p>
            <form
              className="admin-duty-operations__form"
              noValidate
              onSubmit={(event) => void submit(event)}
            >
              <div className="admin-duty__field">
                <Label htmlFor="duty-source-name">Nom</Label>
                <Input
                  id="duty-source-name"
                  maxLength={180}
                  onChange={(event) =>
                    setFields({ ...fields, name: event.target.value })
                  }
                  required
                  value={fields.name}
                />
              </div>
              <div className="admin-duty__field">
                <Label htmlFor="duty-source-description">
                  Description facultative
                </Label>
                <Textarea
                  id="duty-source-description"
                  onChange={(event) =>
                    setFields({ ...fields, description: event.target.value })
                  }
                  value={fields.description}
                />
              </div>
              <div className="admin-duty__field">
                <Label htmlFor="duty-source-reliability">
                  Fiabilité renseignée (0 à 100)
                </Label>
                <Input
                  id="duty-source-reliability"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setFields({ ...fields, reliability: event.target.value })
                  }
                  type="number"
                  value={fields.reliability}
                />
              </div>
              <div className="admin-duty-operations__dates">
                <div className="admin-duty__field">
                  <Label htmlFor="duty-source-date">Date d’observation</Label>
                  <Input
                    id="duty-source-date"
                    onChange={(event) =>
                      setFields({ ...fields, date: event.target.value })
                    }
                    required
                    type="date"
                    value={fields.date}
                  />
                </div>
                <div className="admin-duty__field">
                  <Label htmlFor="duty-source-time">Heure (Brazzaville)</Label>
                  <Input
                    id="duty-source-time"
                    onChange={(event) =>
                      setFields({ ...fields, time: event.target.value })
                    }
                    required
                    type="time"
                    value={fields.time}
                  />
                </div>
              </div>
              {error ? <p role="alert">{error}</p> : null}
              {feedback ? <p role="status">{feedback}</p> : null}
              <div className="admin-duty-operations__actions">
                {editingId ? (
                  <Button onClick={resetForm} type="button" variant="outline">
                    Annuler
                  </Button>
                ) : null}
                <Button
                  className="admin-duty__primary-action"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Enregistrement…"
                    : editingId
                      ? "Enregistrer la source"
                      : "Créer la source"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
