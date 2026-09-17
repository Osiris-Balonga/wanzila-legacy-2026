import type {
  AdminDuty,
  AdminDutyRevision,
  AdminPharmacy,
  AdminScheduleSource,
} from "@wanzila/contracts";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DutyHttpError,
  isDutyAuthError,
  listPharmacies,
  listSources,
  loadDuty,
  loadDutyPharmacy,
  loadDutyRevisions,
  reviewDutyRevision,
  submitDutyRevision,
  updatePendingDuty,
} from "./admin-duty-client";
import {
  dateLabel,
  initialFields,
  toInstant,
  type LocalFields,
} from "./admin-duty-edit-format";
import { DutyAuthNotice } from "./DutyAuthNotice";
import { DutyEditForm } from "./DutyEditForm";
import { DutyEditSidebar, type ReviewTarget } from "./DutyEditSidebar";
import "./admin-duty-edit.css";

type RevisionPage = Awaited<ReturnType<typeof loadDutyRevisions>>;
type Ready = {
  kind: "ready";
  duty: AdminDuty;
  pharmacy: AdminPharmacy;
  pharmacies: AdminPharmacy[];
  sources: AdminScheduleSource[];
  revisions: RevisionPage | null;
};
type PageState =
  | { kind: "loading" }
  | Ready
  | { kind: "rejected" }
  | { kind: "auth" | "forbidden" | "not-found" | "malformed" | "error" };

function pageFailure(error: unknown): PageState {
  if (isDutyAuthError(error)) return { kind: "auth" };
  if (error instanceof DutyHttpError) {
    if (error.status === 403) return { kind: "forbidden" };
    if (error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
  return error instanceof Error && error.name === "ZodError"
    ? { kind: "malformed" }
    : { kind: "error" };
}

export function AdminDutyEdit({ id }: { id: string }) {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [fields, setFields] = useState<LocalFields>({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [sourceId, setSourceId] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [pharmacySearchError, setPharmacySearchError] = useState("");
  const [pharmacySearchBusy, setPharmacySearchBusy] = useState(false);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingRevision, setPendingRevision] =
    useState<AdminDutyRevision | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const reviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusHistoryAfterReview = useRef(false);
  const submissionLocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void loadDuty(id)
      .then(async (duty) => {
        if (cancelled) return;
        if (duty.status === "REJECTED") {
          setState({ kind: "rejected" });
          return;
        }
        const [pharmacy, sources, revisions, pharmacyOptions] =
          await Promise.all([
            loadDutyPharmacy(duty.pharmacyId),
            listSources(),
            duty.status === "APPROVED"
              ? loadDutyRevisions(id, 1)
              : Promise.resolve(null),
            duty.status === "PENDING" ? listPharmacies() : Promise.resolve([]),
          ]);
        if (cancelled) return;
        setState({
          kind: "ready",
          duty,
          pharmacy,
          pharmacies: [
            pharmacy,
            ...pharmacyOptions.filter((item) => item.id !== pharmacy.id),
          ],
          sources,
          revisions,
        });
        setFields(initialFields(duty));
        setPharmacyId(duty.pharmacyId);
        setPharmacySearch("");
        setPharmacySearchError("");
        setSourceId(duty.sourceId ?? "");
        setPendingRevision(
          revisions?.data.find((revision) => revision.status === "PENDING") ??
            null,
        );
      })
      .catch((failure: unknown) => {
        if (!cancelled) setState(pageFailure(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (state.kind !== "ready" || !focusHistoryAfterReview.current) return;
    focusHistoryAfterReview.current = false;
    requestAnimationFrame(() =>
      document.getElementById("duty-edit-history-heading")?.focus(),
    );
  }, [state]);

  function refresh() {
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }

  async function searchPharmacies() {
    if (
      state.kind !== "ready" ||
      state.duty.status !== "PENDING" ||
      pharmacySearchBusy
    )
      return;
    setPharmacySearchBusy(true);
    setPharmacySearchError("");
    try {
      const matches = await listPharmacies(pharmacySearch);
      setState((current) => {
        if (current.kind !== "ready") return current;
        const selected = current.pharmacies.find(
          (item) => item.id === pharmacyId,
        );
        return {
          ...current,
          pharmacies:
            selected && !matches.some((item) => item.id === selected.id)
              ? [selected, ...matches]
              : matches,
        };
      });
    } catch (failure) {
      if (isDutyAuthError(failure)) setState({ kind: "auth" });
      else
        setPharmacySearchError("La recherche de pharmacies est indisponible.");
    } finally {
      setPharmacySearchBusy(false);
    }
  }

  function openReview(target: ReviewTarget, trigger: HTMLButtonElement) {
    reviewTriggerRef.current = trigger;
    setReviewError("");
    setReviewTarget(target);
  }

  function closeReview() {
    if (reviewBusy) return;
    setReviewTarget(null);
    requestAnimationFrame(() => reviewTriggerRef.current?.focus());
  }

  async function changeHistoryPage(page: number) {
    if (state.kind !== "ready" || !state.revisions || historyBusy) return;
    setHistoryBusy(true);
    try {
      const result = await loadDutyRevisions(id, page);
      const revisions =
        result.pagination.totalPages < page
          ? await loadDutyRevisions(id, 1)
          : result;
      setState((current) =>
        current.kind === "ready" ? { ...current, revisions } : current,
      );
    } catch (failure) {
      setState(pageFailure(failure));
    } finally {
      setHistoryBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || pendingRevision || submissionLocked.current)
      return;
    setError("");
    setFeedback("");
    const startsAt = toInstant(fields.startDate, fields.startTime);
    const endsAt = toInstant(fields.endDate, fields.endTime);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError(
        "La fin doit être après le début. Vérifiez les dates et heures.",
      );
      return;
    }
    if (state.duty.status === "PENDING") {
      submissionLocked.current = true;
      setSaving(true);
      try {
        const updated = await updatePendingDuty(id, {
          pharmacyId,
          sourceId: sourceId || null,
          startsAt,
          endsAt,
        });
        if (updated.status !== "PENDING")
          throw new Error("Unexpected duty status");
        setFeedback(
          "Modifications enregistrées. Cette garde reste en attente d’approbation et n’est pas encore publiée.",
        );
        refresh();
      } catch (failure) {
        if (isDutyAuthError(failure)) setState({ kind: "auth" });
        else if (failure instanceof DutyHttpError && failure.status === 403)
          setState({ kind: "forbidden" });
        else if (failure instanceof DutyHttpError && failure.status === 409) {
          setFeedback(
            "L’état de la garde a changé. Les données ont été rechargées depuis le serveur.",
          );
          refresh();
        } else
          setError(
            "La garde n’a pas pu être enregistrée. Vérifiez les données et réessayez.",
          );
      } finally {
        submissionLocked.current = false;
        setSaving(false);
      }
      return;
    }
    if (!note.trim()) {
      setError("Le motif de la révision est obligatoire.");
      return;
    }
    if (note.trim().length > 500) {
      setError("Le motif ne peut pas dépasser 500 caractères.");
      return;
    }
    submissionLocked.current = true;
    setSaving(true);
    try {
      const created = await submitDutyRevision(id, {
        sourceId: sourceId || null,
        startsAt,
        endsAt,
        note: note.trim(),
      });
      if (created.status !== "PENDING")
        throw new Error("Unexpected revision status");
      setPendingRevision(created);
      setNote("");
      setFeedback(
        "Révision en attente d’approbation. L’ancienne garde reste publiée.",
      );
      refresh();
    } catch (failure) {
      if (isDutyAuthError(failure)) setState({ kind: "auth" });
      else if (failure instanceof DutyHttpError && failure.status === 403)
        setState({ kind: "forbidden" });
      else
        setError(
          failure instanceof DutyHttpError && failure.status === 409
            ? "Conflit de révision : la garde a changé. Actualisez les données avant de réessayer."
            : "La révision n’a pas pu être soumise. Vérifiez les données et réessayez.",
        );
    } finally {
      submissionLocked.current = false;
      setSaving(false);
    }
  }

  async function performReview() {
    if (!reviewTarget || reviewBusy) return;
    const target = reviewTarget;
    setReviewBusy(true);
    setReviewError("");
    setError("");
    setFeedback("");
    try {
      const reviewed = await reviewDutyRevision(
        id,
        target.revision.id,
        target.action,
      );
      if (
        reviewed.status !==
        (target.action === "approve" ? "APPROVED" : "REJECTED")
      )
        throw new Error("Unexpected review status");
      focusHistoryAfterReview.current = true;
      setReviewTarget(null);
      setFeedback(
        target.action === "approve"
          ? "Révision approuvée."
          : "Révision rejetée.",
      );
      if (target.action === "reject") setPendingRevision(null);
      refresh();
    } catch (failure) {
      if (isDutyAuthError(failure)) {
        setReviewTarget(null);
        setState({ kind: "auth" });
      } else if (failure instanceof DutyHttpError && failure.status === 403) {
        setReviewTarget(null);
        setState({ kind: "forbidden" });
      } else {
        setReviewError(
          failure instanceof DutyHttpError && failure.status === 409
            ? "Conflit de révision : son état a changé. Actualisez les données avant de réessayer."
            : "La revue n’a pas pu aboutir. Réessayez ou annulez.",
        );
      }
    } finally {
      setReviewBusy(false);
    }
  }

  const ready = state.kind === "ready" ? state : null;
  const selectedPharmacy =
    ready?.pharmacies.find((item) => item.id === pharmacyId) ?? ready?.pharmacy;
  return (
    <div className="admin-duty admin-duty-edit">
      <a className="admin-duty__back" href="/admin/gardes">
        <ArrowLeft aria-hidden="true" />
        Retour aux gardes
      </a>
      <header className="admin-duty__heading admin-duty-edit__heading">
        <div>
          <h1>Modifier une garde</h1>
          <p>
            {ready?.duty.status === "PENDING"
              ? "Corrigez le planning avant sa revue."
              : "Proposez une modification traçable du planning de garde."}
          </p>
        </div>
        {ready ? (
          <div className="admin-duty-edit__published">
            <Badge
              className={`admin-duty-edit__published-badge${ready.duty.status === "PENDING" ? " admin-duty-edit__pending-badge" : ""}`}
              variant="secondary"
            >
              {ready.duty.status === "PENDING"
                ? "Garde en attente"
                : "Garde publiée"}
            </Badge>
            <span>Créée le {dateLabel(ready.duty.createdAt)}</span>
          </div>
        ) : null}
      </header>

      {state.kind === "loading" ? (
        <div
          aria-label="Chargement de la garde"
          className="admin-duty-edit__loading"
          role="status"
        >
          <span>Chargement de la garde…</span>
          <Skeleton className="admin-duty-edit__loading-form" />
        </div>
      ) : null}
      {state.kind === "auth" ? <DutyAuthNotice /> : null}
      {state.kind === "rejected" ? (
        <Alert role="note">
          <AlertTitle>Garde rejetée</AlertTitle>
          <AlertDescription>
            L’édition de cette garde est indisponible dans cet écran. Retournez
            à la liste des gardes.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "forbidden" ||
      state.kind === "not-found" ||
      state.kind === "malformed" ||
      state.kind === "error" ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle>
            {state.kind === "forbidden"
              ? "Accès refusé"
              : state.kind === "not-found"
                ? "Garde introuvable"
                : state.kind === "malformed"
                  ? "Réponse invalide"
                  : "Informations indisponibles"}
          </AlertTitle>
          <AlertDescription>
            {state.kind === "forbidden"
              ? "Vous n’avez pas l’autorisation de consulter cette garde."
              : state.kind === "not-found"
                ? "La garde demandée n’existe plus."
                : state.kind === "malformed"
                  ? "Les données reçues sont invalides. Réessayez plus tard."
                  : "La garde ou son historique ne peuvent pas être chargés. Réessayez."}
          </AlertDescription>
          {state.kind === "error" || state.kind === "malformed" ? (
            <Button onClick={refresh} type="button" variant="outline">
              Réessayer
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {ready ? (
        <div className="admin-duty-edit__grid">
          <DutyEditForm
            error={error}
            feedback={feedback}
            fields={fields}
            mode={ready.duty.status === "PENDING" ? "pending" : "approved"}
            pharmacies={ready.pharmacies}
            pharmacyId={pharmacyId}
            pharmacySearch={pharmacySearch}
            pharmacySearchBusy={pharmacySearchBusy}
            pharmacySearchError={pharmacySearchError}
            note={note}
            onFieldsChange={(update) =>
              setFields((current) => ({ ...current, ...update }))
            }
            onNoteChange={setNote}
            onPharmacyChange={setPharmacyId}
            onPharmacySearchChange={setPharmacySearch}
            onSearchPharmacies={() => void searchPharmacies()}
            onRefresh={refresh}
            onSourceChange={setSourceId}
            onSubmit={(event) => void submit(event)}
            pendingRevision={Boolean(pendingRevision)}
            pharmacy={selectedPharmacy ?? ready.pharmacy}
            saving={saving}
            sourceId={sourceId}
            sources={ready.sources}
          />
          <DutyEditSidebar
            duty={ready.duty}
            fields={fields}
            historyBusy={historyBusy}
            onHistoryPage={(page) => void changeHistoryPage(page)}
            onReview={openReview}
            pharmacy={selectedPharmacy ?? ready.pharmacy}
            revisions={ready.revisions}
            sources={ready.sources}
          />
        </div>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        open={Boolean(reviewTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewTarget?.action === "approve"
                ? "Approuver la révision ?"
                : "Rejeter la révision ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewTarget?.action === "approve"
                ? "La proposition remplacera la version publiée après confirmation."
                : "La garde publiée restera inchangée. Une autre révision pourra être soumise."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reviewError ? (
            <p className="admin-duty__alert" role="alert">
              {reviewError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={
                reviewTarget?.action === "approve"
                  ? "admin-duty__primary-action"
                  : undefined
              }
              disabled={reviewBusy}
              onClick={(event) => {
                event.preventDefault();
                void performReview();
              }}
            >
              {reviewBusy
                ? "Validation…"
                : reviewTarget?.action === "approve"
                  ? "Confirmer l’approbation"
                  : "Confirmer le rejet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
