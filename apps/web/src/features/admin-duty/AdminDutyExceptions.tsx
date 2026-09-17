import type {
  AdminDuty,
  AdminDutyException,
  AdminPharmacy,
} from "@wanzila/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DutyAuthNotice } from "./DutyAuthNotice";
import {
  DutyHttpError,
  cancelFullDuty,
  isDutyAuthError,
  listExceptions,
  loadDuty,
  loadDutyPharmacy,
  saveException,
} from "./admin-duty-client";
import { dateLabel, localParts, toInstant } from "./admin-duty-edit-format";

type Ready = {
  kind: "ready";
  duty: AdminDuty;
  pharmacy: AdminPharmacy;
  exceptions: AdminDutyException[];
};
type LoadState =
  | { kind: "loading" }
  | Ready
  | { kind: "auth" | "forbidden" | "not-found" | "error" };
type Fields = {
  kind: "CANCELLED" | "UNAVAILABLE";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
};

function fieldsForDuty(duty: AdminDuty): Fields {
  const start = localParts(duty.startsAt);
  const end = localParts(duty.endsAt);
  return {
    kind: "UNAVAILABLE",
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    reason: "",
  };
}

function fieldsForException(exception: AdminDutyException): Fields {
  const start = localParts(exception.startsAt);
  const end = localParts(exception.endsAt);
  return {
    kind: exception.kind,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    reason: exception.reason ?? "",
  };
}

function isFullCancellation(
  duty: AdminDuty,
  exception: AdminDutyException,
): boolean {
  return (
    exception.kind === "CANCELLED" &&
    exception.startsAt === duty.startsAt &&
    exception.endsAt === duty.endsAt
  );
}

function failureKind(error: unknown): LoadState {
  return {
    kind: isDutyAuthError(error)
      ? "auth"
      : error instanceof DutyHttpError && error.status === 403
        ? "forbidden"
        : error instanceof DutyHttpError && error.status === 404
          ? "not-found"
          : "error",
  };
}

export function AdminDutyExceptions({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [fields, setFields] = useState<Fields | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadDuty(id)
      .then(async (duty) => {
        const [pharmacy, exceptions] = await Promise.all([
          loadDutyPharmacy(duty.pharmacyId),
          listExceptions(id),
        ]);
        if (!cancelled) {
          setState({ kind: "ready", duty, pharmacy, exceptions });
          setFields((current) => current ?? fieldsForDuty(duty));
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) setState(failureKind(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  function refresh() {
    setReload((value) => value + 1);
  }

  function resetForm(duty: AdminDuty) {
    setEditingId(null);
    setFields(fieldsForDuty(duty));
    setError("");
  }

  function edit(exception: AdminDutyException) {
    setEditingId(exception.id);
    setFields(fieldsForException(exception));
    setError("");
    setFeedback("");
    document.getElementById("duty-exception-kind")?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || !fields || busy) return;
    setError("");
    setFeedback("");
    const startsAt = toInstant(fields.startDate, fields.startTime);
    const endsAt = toInstant(fields.endDate, fields.endTime);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("La fin de l’exception doit être après son début.");
      return;
    }
    if (startsAt < state.duty.startsAt || endsAt > state.duty.endsAt) {
      setError("L’exception doit rester dans la période de garde approuvée.");
      return;
    }
    setBusy(true);
    try {
      await saveException(
        id,
        {
          kind: fields.kind,
          startsAt,
          endsAt,
          ...(editingId
            ? { reason: fields.reason.trim() || null }
            : fields.reason.trim()
              ? { reason: fields.reason.trim() }
              : {}),
        },
        editingId ?? undefined,
      );
      setFeedback(
        editingId
          ? "Exception mise à jour."
          : "Exception enregistrée. La disponibilité publique sera recalculée.",
      );
      resetForm(state.duty);
      refresh();
    } catch (failure) {
      if (isDutyAuthError(failure)) setState({ kind: "auth" });
      else if (failure instanceof DutyHttpError && failure.status === 403)
        setState({ kind: "forbidden" });
      else if (failure instanceof DutyHttpError && failure.status === 409) {
        setEditingId(null);
        setFields(null);
        setError(
          "Conflit : la garde a changé ou une exception chevauche cette période. Vérifiez les données rechargées.",
        );
        refresh();
      } else
        setError(
          "L’exception n’a pas pu être enregistrée. Vérifiez les dates et réessayez.",
        );
    } finally {
      setBusy(false);
    }
  }

  async function cancelDuty() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await cancelFullDuty(id);
      setConfirmCancel(false);
      setFeedback(
        "Annulation enregistrée pour toute la période. La garde n’apparaîtra plus comme active.",
      );
      refresh();
    } catch (failure) {
      setConfirmCancel(false);
      if (isDutyAuthError(failure)) setState({ kind: "auth" });
      else if (failure instanceof DutyHttpError && failure.status === 403)
        setState({ kind: "forbidden" });
      else if (failure instanceof DutyHttpError && failure.status === 409) {
        setError(
          "Annulation impossible : la garde a changé ou n’est plus approuvée. Vérifiez les données rechargées.",
        );
        refresh();
      } else setError("L’annulation n’a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  const ready = state.kind === "ready" ? state : null;
  const fullyCancelled = ready?.exceptions.some((exception) =>
    isFullCancellation(ready.duty, exception),
  );
  return (
    <div className="admin-duty admin-duty-operations">
      <a className="admin-duty__back" href="/admin/gardes">
        Retour aux gardes
      </a>
      <header className="admin-duty__heading">
        <div>
          <h1>Exceptions de garde</h1>
          <p>
            Corrigez une indisponibilité ou une annulation connue, sans modifier
            la période approuvée.
          </p>
        </div>
      </header>
      {state.kind === "auth" ? <DutyAuthNotice /> : null}
      {state.kind === "forbidden" ? (
        <Alert role="alert">
          <AlertDescription>Accès refusé.</AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "not-found" ? (
        <Alert role="alert">
          <AlertDescription>Garde introuvable.</AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "error" ? (
        <Alert role="alert">
          <AlertDescription>
            Exceptions indisponibles.{" "}
            <Button onClick={refresh} type="button" variant="outline">
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "loading" ? (
        <p role="status">Chargement des exceptions…</p>
      ) : null}
      {ready ? (
        <>
          <section
            aria-label="Garde concernée"
            className="admin-duty__list-panel admin-duty-operations__context"
          >
            <div>
              <h2>{ready.pharmacy.name}</h2>
              <p>
                Du {dateLabel(ready.duty.startsAt)} au{" "}
                {dateLabel(ready.duty.endsAt)} ·{" "}
                {ready.duty.status === "APPROVED"
                  ? "Approuvée"
                  : "Non approuvée"}
              </p>
            </div>
            {ready.duty.status === "APPROVED" && !fullyCancelled ? (
              <Button
                disabled={busy}
                onClick={() => setConfirmCancel(true)}
                type="button"
                variant="destructive"
              >
                Annuler toute la garde
              </Button>
            ) : null}
          </section>
          {fullyCancelled ? (
            <Alert role="note">
              <AlertDescription>
                Garde entièrement annulée. Les exceptions antérieures restent
                dans l’historique et ne peuvent plus être modifiées.
              </AlertDescription>
            </Alert>
          ) : null}
          {feedback ? <p role="status">{feedback}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {ready.duty.status !== "APPROVED" ? (
            <Alert role="note">
              <AlertDescription>
                Les exceptions ne peuvent être modifiées que sur une garde
                approuvée.
              </AlertDescription>
            </Alert>
          ) : (
            <div
              className={`admin-duty-operations__grid${fullyCancelled ? " admin-duty-operations__grid--single" : ""}`}
            >
              <section
                aria-label="Liste des exceptions"
                className="admin-duty__list-panel"
              >
                <h2>Exceptions enregistrées</h2>
                {ready.exceptions.length ? (
                  <ul className="admin-duty-operations__list">
                    {ready.exceptions.map((exception) => (
                      <li key={exception.id}>
                        <div>
                          <strong>
                            {isFullCancellation(ready.duty, exception)
                              ? "Annulation complète"
                              : exception.kind === "CANCELLED"
                                ? "Annulation"
                                : "Indisponibilité"}
                          </strong>
                          <span>
                            Du {dateLabel(exception.startsAt)} au{" "}
                            {dateLabel(exception.endsAt)}
                          </span>
                          {exception.reason ? (
                            <span>{exception.reason}</span>
                          ) : null}
                        </div>
                        {!fullyCancelled ? (
                          <Button
                            aria-label={`Modifier l’exception du ${dateLabel(exception.startsAt)}`}
                            onClick={() => edit(exception)}
                            type="button"
                            variant="outline"
                          >
                            Modifier
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucune exception enregistrée.</p>
                )}
              </section>
              {!fullyCancelled ? (
                <section
                  aria-label="Formulaire d’exception"
                  className="admin-duty__form-panel"
                >
                  <h2>
                    {editingId
                      ? "Modifier une exception"
                      : "Ajouter une exception"}
                  </h2>
                  <p>
                    Une exception peut couvrir tout ou partie de la garde. Les
                    périodes ne peuvent pas se chevaucher.
                  </p>
                  {fields ? (
                    <form
                      className="admin-duty-operations__form"
                      noValidate
                      onSubmit={(event) => void submit(event)}
                    >
                      <div className="admin-duty__field">
                        <Label htmlFor="duty-exception-kind">Nature</Label>
                        <Select
                          onValueChange={(value) =>
                            setFields({
                              ...fields,
                              kind: value as Fields["kind"],
                            })
                          }
                          value={fields.kind}
                        >
                          <SelectTrigger id="duty-exception-kind">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UNAVAILABLE">
                              Indisponibilité
                            </SelectItem>
                            <SelectItem value="CANCELLED">
                              Annulation
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="admin-duty-operations__dates">
                        <div className="admin-duty__field">
                          <Label htmlFor="duty-exception-start-date">
                            Date de début
                          </Label>
                          <Input
                            id="duty-exception-start-date"
                            onChange={(event) =>
                              setFields({
                                ...fields,
                                startDate: event.target.value,
                              })
                            }
                            required
                            type="date"
                            value={fields.startDate}
                          />
                        </div>
                        <div className="admin-duty__field">
                          <Label htmlFor="duty-exception-start-time">
                            Heure de début
                          </Label>
                          <Input
                            id="duty-exception-start-time"
                            onChange={(event) =>
                              setFields({
                                ...fields,
                                startTime: event.target.value,
                              })
                            }
                            required
                            type="time"
                            value={fields.startTime}
                          />
                        </div>
                        <div className="admin-duty__field">
                          <Label htmlFor="duty-exception-end-date">
                            Date de fin
                          </Label>
                          <Input
                            id="duty-exception-end-date"
                            onChange={(event) =>
                              setFields({
                                ...fields,
                                endDate: event.target.value,
                              })
                            }
                            required
                            type="date"
                            value={fields.endDate}
                          />
                        </div>
                        <div className="admin-duty__field">
                          <Label htmlFor="duty-exception-end-time">
                            Heure de fin
                          </Label>
                          <Input
                            id="duty-exception-end-time"
                            onChange={(event) =>
                              setFields({
                                ...fields,
                                endTime: event.target.value,
                              })
                            }
                            required
                            type="time"
                            value={fields.endTime}
                          />
                        </div>
                      </div>
                      <div className="admin-duty__field">
                        <Label htmlFor="duty-exception-reason">
                          Motif facultatif
                        </Label>
                        <Textarea
                          id="duty-exception-reason"
                          maxLength={255}
                          onChange={(event) =>
                            setFields({ ...fields, reason: event.target.value })
                          }
                          value={fields.reason}
                        />
                      </div>
                      <div className="admin-duty-operations__actions">
                        {editingId ? (
                          <Button
                            onClick={() => resetForm(ready.duty)}
                            type="button"
                            variant="outline"
                          >
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
                              ? "Enregistrer l’exception"
                              : "Ajouter l’exception"}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </>
      ) : null}
      <AlertDialog onOpenChange={setConfirmCancel} open={confirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler toute cette garde ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une exception d’annulation couvrira toute la période approuvée.
              Les exceptions antérieures resteront dans l’historique. Cette
              opération modifie la disponibilité publique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Retour</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void cancelDuty();
              }}
            >
              Confirmer l’annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
