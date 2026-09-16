import type { AdminDuty } from "@wanzila/contracts";
import { CalendarCheckIcon } from "@phosphor-icons/react/CalendarCheck";
import { CalendarXIcon } from "@phosphor-icons/react/CalendarX";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { Check, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DutyHttpError,
  type DutyDirectory,
  type DutyFilters,
  type DutySummary,
  loadDirectory,
  loadSummary,
  reviewDuty,
} from "./admin-duty-client";

type LoadState<T> =
  { kind: "loading" } | { kind: "ready"; data: T } | { kind: "error" };

type ReviewTarget = {
  duty: AdminDuty;
  name: string;
  action: "approve" | "reject";
};

function initialFilters(): DutyFilters {
  const query = new URLSearchParams(globalThis.location.search);
  return {
    q: query.get("q") ?? "",
    status: query.get("status") ?? "",
    sourceId: query.get("sourceId") ?? "",
    from: query.get("from") ?? "",
    to: query.get("to") ?? "",
    page: Math.max(1, Number(query.get("page")) || 1),
  };
}

function dateFilter(value: string, exclusiveEnd = false): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+01:00`);
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function dateInputValue(value: string, exclusiveEnd = false): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() - 1);
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(date);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-CG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

function statusLabel(status: AdminDuty["status"]): string {
  switch (status) {
    case "PENDING":
      return "En attente";
    case "APPROVED":
      return "Approuvée";
    case "REJECTED":
      return "Rejetée";
  }
}

function SummaryCards({ state }: { state: LoadState<DutySummary> }) {
  const metrics = [
    { key: "active", label: "Gardes actives", icon: CalendarCheckIcon },
    { key: "upcoming", label: "Gardes à venir", icon: ClockIcon },
    { key: "expired", label: "Gardes expirées", icon: CalendarXIcon },
    {
      key: "withoutRecentDuty",
      label: "Sans garde récente",
      icon: WarningIcon,
    },
  ] as const;
  return (
    <section aria-label="Résumé des gardes" className="admin-duty__summary">
      {metrics.map(({ key, label, icon: Icon }) => (
        <Card
          className={`admin-duty__metric admin-duty__metric--${key}`}
          key={key}
        >
          <CardContent>
            <span aria-hidden="true" className="admin-duty__metric-icon">
              <Icon weight="fill" />
            </span>
            {state.kind === "loading" ? (
              <Skeleton
                aria-label={`Chargement : ${label}`}
                className="admin-duty__metric-skeleton"
              />
            ) : (
              <strong className="admin-duty__metric-value">
                {state.kind === "ready" ? state.data[key] : "—"}
              </strong>
            )}
            <span className="admin-duty__metric-label">{label}</span>
          </CardContent>
        </Card>
      ))}
      {state.kind === "error" ? (
        <p className="admin-duty__summary-error" role="status">
          Indicateurs indisponibles pour le moment.
        </p>
      ) : null}
    </section>
  );
}

function DutyRows({
  directory,
  onReview,
}: {
  directory: DutyDirectory;
  onReview: (target: ReviewTarget) => void;
}) {
  return (
    <Table className="admin-duty__table">
      <TableHeader>
        <TableRow>
          <TableHead>Pharmacie</TableHead>
          <TableHead>Début</TableHead>
          <TableHead>Fin</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>État de revue</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {directory.duties.map((duty) => {
          const pharmacy = directory.pharmacies.get(duty.pharmacyId);
          const source = directory.sources.find(
            (item) => item.id === duty.sourceId,
          );
          const name = pharmacy?.name ?? "Pharmacie indisponible";
          return (
            <TableRow key={duty.id}>
              <TableCell data-label="Pharmacie">
                <div>
                  <strong>{name}</strong>
                  {pharmacy ? (
                    <span className="admin-duty__cell-subline">
                      {pharmacy.address.district}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="admin-duty__date" data-label="Début">
                <span>{formatDateTime(duty.startsAt)}</span>
              </TableCell>
              <TableCell className="admin-duty__date" data-label="Fin">
                <span>{formatDateTime(duty.endsAt)}</span>
              </TableCell>
              <TableCell data-label="Source">
                <div>
                  <span>
                    {duty.sourceId
                      ? (source?.name ?? "Source indisponible")
                      : "Sans source"}
                  </span>
                  {source ? (
                    <span className="admin-duty__cell-subline">
                      {source.freshness === "FRESH"
                        ? "Source actualisée"
                        : "Source ancienne"}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell data-label="État">
                <Badge
                  className={`admin-duty__status admin-duty__status--${duty.status.toLowerCase()}`}
                  variant="secondary"
                >
                  {statusLabel(duty.status)}
                </Badge>
              </TableCell>
              <TableCell data-label="Actions">
                <div className="admin-duty__row-actions">
                  {duty.status === "PENDING" ? (
                    <>
                      <Button
                        aria-label={`Approuver la garde de ${name}`}
                        onClick={() =>
                          onReview({ duty, name, action: "approve" })
                        }
                        size="sm"
                        title="Approuver"
                        variant="outline"
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Rejeter la garde de ${name}`}
                        onClick={() =>
                          onReview({ duty, name, action: "reject" })
                        }
                        size="sm"
                        title="Rejeter"
                        variant="outline"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions pour ${name}`}
                        size="icon"
                        title="Autres actions"
                        variant="outline"
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {pharmacy ? (
                        <DropdownMenuItem asChild>
                          <a href={`/admin/pharmacies/${pharmacy.id}`}>
                            Voir la pharmacie
                          </a>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled>
                          Pharmacie indisponible
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function AdminDutyList() {
  const [filters, setFilters] = useState<DutyFilters>(initialFilters);
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [fromDraft, setFromDraft] = useState(() =>
    dateInputValue(filters.from),
  );
  const [toDraft, setToDraft] = useState(() =>
    dateInputValue(filters.to, true),
  );
  const [directory, setDirectory] = useState<LoadState<DutyDirectory>>({
    kind: "loading",
  });
  const [summary, setSummary] = useState<LoadState<DutySummary>>({
    kind: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setDirectory({ kind: "loading" });
    void loadDirectory(filters)
      .then((data) => {
        if (!cancelled) setDirectory({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setDirectory({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setSummary({ kind: "loading" });
    void loadSummary()
      .then((data) => {
        if (!cancelled) setSummary({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setSummary({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, summaryReloadKey]);

  function updateFilters(next: DutyFilters) {
    const query = new URLSearchParams();
    if (next.q) query.set("q", next.q);
    if (next.status) query.set("status", next.status);
    if (next.sourceId) query.set("sourceId", next.sourceId);
    if (next.from) query.set("from", next.from);
    if (next.to) query.set("to", next.to);
    if (next.page > 1) query.set("page", String(next.page));
    const search = query.toString();
    window.history.replaceState(
      null,
      "",
      `/admin/gardes${search ? `?${search}` : ""}`,
    );
    setFilters(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilters({ ...filters, q: searchDraft.trim(), page: 1 });
  }

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilters({
      ...filters,
      from: dateFilter(fromDraft),
      to: dateFilter(toDraft, true),
      page: 1,
    });
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    setReviewBusy(true);
    setReviewError("");
    try {
      const updated = await reviewDuty(
        reviewTarget.duty.id,
        reviewTarget.action,
      );
      setDirectory((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              data: {
                ...current.data,
                duties: current.data.duties.map((duty) =>
                  duty.id === updated.id ? updated : duty,
                ),
              },
            }
          : current,
      );
      setReviewTarget(null);
      setSummaryReloadKey((value) => value + 1);
    } catch (error) {
      setReviewTarget(null);
      setReviewError(
        error instanceof DutyHttpError && error.status === 409
          ? "Conflit de garde : une période approuvée se chevauche ou le statut a changé. Rechargez la liste avant de réessayer."
          : "La décision n’a pas été enregistrée. Réessayez.",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  const sourceOptions =
    directory.kind === "ready" ? directory.data.sources : [];
  const page = directory.kind === "ready" ? directory.data.pagination : null;

  return (
    <div className="admin-duty">
      <header className="admin-duty__heading">
        <div>
          <h1>Gardes</h1>
          <p>Gestion des périodes de garde des pharmacies.</p>
        </div>
        <Button asChild className="admin-duty__primary-action">
          <a href="/admin/gardes/nouvelle">
            <Plus aria-hidden="true" />
            Créer une garde
          </a>
        </Button>
      </header>

      <SummaryCards state={summary} />

      <section aria-label="Liste des gardes" className="admin-duty__list-panel">
        <div className="admin-duty__section-head">
          <div>
            <h2>Liste des gardes</h2>
            <p>Consultez, filtrez et gérez les périodes de garde.</p>
          </div>
        </div>
        <div className="admin-duty__filters">
          <form
            className="admin-duty__search"
            onSubmit={submitSearch}
            role="search"
          >
            <Search aria-hidden="true" />
            <Input
              aria-label="Rechercher une pharmacie"
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Rechercher une pharmacie, un quartier..."
              type="search"
              value={searchDraft}
            />
            <Button className="sr-only" type="submit">
              Rechercher
            </Button>
          </form>
          <Select
            onValueChange={(value) =>
              updateFilters({
                ...filters,
                status: value === "all" ? "" : value,
                page: 1,
              })
            }
            value={filters.status || "all"}
          >
            <SelectTrigger aria-label="État de revue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les états</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="APPROVED">Approuvée</SelectItem>
              <SelectItem value="REJECTED">Rejetée</SelectItem>
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) =>
              updateFilters({
                ...filters,
                sourceId: value === "all" ? "" : value,
                page: 1,
              })
            }
            value={filters.sourceId || "all"}
          >
            <SelectTrigger aria-label="Source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form className="admin-duty__date-filters" onSubmit={applyDates}>
          <div>
            <Label htmlFor="duty-from">Du</Label>
            <Input
              id="duty-from"
              onChange={(event) => setFromDraft(event.target.value)}
              type="date"
              value={fromDraft}
            />
          </div>
          <div>
            <Label htmlFor="duty-to">Au</Label>
            <Input
              id="duty-to"
              onChange={(event) => setToDraft(event.target.value)}
              type="date"
              value={toDraft}
            />
          </div>
          <Button type="submit" variant="outline">
            Appliquer les dates
          </Button>
        </form>

        {reviewError ? (
          <p className="admin-duty__alert" role="alert">
            {reviewError}
          </p>
        ) : null}
        {directory.kind === "loading" ? (
          <div className="admin-duty__loading" role="status">
            <span>Chargement des gardes…</span>
            <Skeleton className="admin-duty__row-skeleton" />
            <Skeleton className="admin-duty__row-skeleton" />
          </div>
        ) : directory.kind === "error" ? (
          <div className="admin-duty__empty">
            <p role="alert">Les gardes sont indisponibles pour le moment.</p>
            <Button onClick={refresh} variant="outline">
              Réessayer
            </Button>
          </div>
        ) : directory.data.duties.length === 0 ? (
          <div className="admin-duty__empty">
            <p>Aucune garde trouvée</p>
            <span>Modifiez les filtres ou créez une nouvelle garde.</span>
          </div>
        ) : (
          <DutyRows directory={directory.data} onReview={setReviewTarget} />
        )}
        {page ? (
          <nav
            aria-label="Pagination des gardes"
            className="admin-duty__pagination"
          >
            <span>
              {page.total === 0
                ? "0 garde"
                : `Affichage de ${(page.page - 1) * page.pageSize + 1} à ${Math.min(page.page * page.pageSize, page.total)} sur ${page.total} gardes`}
            </span>
            <div>
              <Button
                disabled={page.page <= 1}
                onClick={() =>
                  updateFilters({ ...filters, page: page.page - 1 })
                }
                variant="outline"
              >
                Page précédente
              </Button>
              <span>
                Page {page.page} sur {Math.max(page.totalPages, 1)}
              </span>
              <Button
                disabled={page.page >= page.totalPages}
                onClick={() =>
                  updateFilters({ ...filters, page: page.page + 1 })
                }
                variant="outline"
              >
                Page suivante
              </Button>
            </div>
          </nav>
        ) : null}
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
        open={reviewTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewTarget?.action === "approve"
                ? "Approuver cette garde ?"
                : "Rejeter cette garde ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewTarget?.action === "approve"
                ? "Une garde approuvée peut devenir visible publiquement pendant sa période, sauf exception. Vérifiez les dates et la source."
                : "Une garde rejetée ne sera pas publiée."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="admin-duty__primary-action"
              disabled={reviewBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmReview();
              }}
            >
              {reviewTarget?.action === "approve"
                ? "Confirmer l’approbation"
                : "Confirmer le rejet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
