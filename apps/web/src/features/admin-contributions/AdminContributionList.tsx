import { useEffect, useMemo, useState } from "react";
import type { AdminContribution } from "@wanzila/contracts";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  contributionError,
  listContributions,
  redirectIfUnauthenticated,
} from "./client";

const statuses = [
  { value: "PENDING", label: "En attente" },
  { value: "APPROVED", label: "Approuvées" },
  { value: "REJECTED", label: "Rejetées" },
] as const;

function statusLabel(status: AdminContribution["status"]) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

type ListState = {
  data: AdminContribution[];
  page: number;
  total: number;
  totalPages: number;
  counts: Record<"PENDING" | "APPROVED" | "REJECTED", number>;
};

export function AdminContributionList() {
  const [status, setStatus] = useState(
    () =>
      new URLSearchParams(window.location.search).get("status") ?? "PENDING",
  );
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; value: ListState }
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void Promise.all([
      listContributions(status, page),
      listContributions("PENDING", 1),
      listContributions("APPROVED", 1),
      listContributions("REJECTED", 1),
    ])
      .then(([list, pending, approved, rejected]) => {
        if (!active) return;
        setState({
          kind: "ready",
          value: {
            data: list.data,
            page: list.pagination.page,
            total: list.pagination.total,
            totalPages: list.pagination.totalPages,
            counts: {
              PENDING: pending.pagination.total,
              APPROVED: approved.pagination.total,
              REJECTED: rejected.pagination.total,
            },
          },
        });
      })
      .catch((error) => {
        if (!active || redirectIfUnauthenticated(error)) return;
        setState({ kind: "error", message: contributionError(error) });
      });
    return () => {
      active = false;
    };
  }, [status, page, retry]);

  const data = state.kind === "ready" ? state.value : null;
  const visible = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLocaleLowerCase("fr");
    if (!normalized) return data.data;
    return data.data.filter((item) =>
      [
        item.name,
        item.address.line,
        item.address.district,
        item.address.arrondissement,
      ].some((text) => text.toLocaleLowerCase("fr").includes(normalized)),
    );
  }, [data, query]);

  return (
    <section
      className="admin-contributions"
      aria-labelledby="contributions-title"
    >
      <header className="admin-contributions__heading">
        <div>
          <p className="overline">Administration · Pharmacies proposées</p>
          <h1 id="contributions-title">Contributions</h1>
          <p>
            Examiner les propositions avant toute création de brouillon. Une
            approbation ne publie pas la pharmacie.
          </p>
        </div>
      </header>

      {data && (
        <div
          className="admin-contributions__metrics"
          aria-label="Répartition des contributions"
        >
          <div className="admin-contributions__metric">
            <Clock3 aria-hidden="true" />
            <strong>{data.counts.PENDING}</strong>
            <span>En attente</span>
          </div>
          <div className="admin-contributions__metric">
            <CheckCircle2 aria-hidden="true" />
            <strong>{data.counts.APPROVED}</strong>
            <span>Approuvées</span>
          </div>
          <div className="admin-contributions__metric">
            <XCircle aria-hidden="true" />
            <strong>{data.counts.REJECTED}</strong>
            <span>Rejetées</span>
          </div>
          <div className="admin-contributions__metric admin-contributions__metric--total">
            <strong>
              {data.counts.PENDING +
                data.counts.APPROVED +
                data.counts.REJECTED}
            </strong>
            <span>Total des contributions</span>
          </div>
        </div>
      )}

      <div className="admin-contributions__panel">
        <div className="admin-contributions__toolbar">
          <div>
            <h2>Liste des contributions</h2>
            {data && <p>{data.total} dans ce statut</p>}
          </div>
          <div className="admin-contributions__filters">
            <label className="admin-contributions__search">
              <Search aria-hidden="true" />
              <span className="sr-only">
                Filtrer les résultats de cette page
              </span>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrer cette page"
              />
            </label>
            <label className="admin-contributions__status-filter">
              <span className="sr-only">Statut</span>
              <select
                aria-label="Statut"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                  setQuery("");
                }}
              >
                <option value="">Tous les statuts</option>
                {statuses.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {state.kind === "loading" && (
          <p className="admin-contributions__notice" role="status">
            Chargement des contributions…
          </p>
        )}
        {state.kind === "error" && (
          <div className="admin-contributions__notice" role="alert">
            <p>{state.message}</p>
            <Button
              onClick={() => setRetry((value) => value + 1)}
              variant="outline"
            >
              Réessayer
            </Button>
          </div>
        )}
        {data &&
          (visible.length ? (
            <>
              <div
                className="admin-contributions__table"
                role="table"
                aria-label="Contributions"
              >
                <div className="admin-contributions__table-head" role="row">
                  <span role="columnheader">Pharmacie proposée</span>
                  <span role="columnheader">Localisation</span>
                  <span role="columnheader">Soumise le</span>
                  <span role="columnheader">Rapprochements</span>
                  <span role="columnheader">Statut</span>
                  <span role="columnheader">Action</span>
                </div>
                {visible.map((item) => (
                  <div
                    className="admin-contributions__row"
                    role="row"
                    key={item.id}
                  >
                    <div role="cell" data-label="Pharmacie proposée">
                      <strong>{item.name}</strong>
                      <small>{item.address.line}</small>
                    </div>
                    <div role="cell" data-label="Localisation">
                      <span>{item.address.district}</span>
                      <small>{item.address.arrondissement}</small>
                    </div>
                    <div role="cell" data-label="Soumise le">
                      {dateLabel(item.createdAt)}
                    </div>
                    <div role="cell" data-label="Rapprochements">
                      {item.duplicates.length
                        ? `${item.duplicates.length} indice${item.duplicates.length > 1 ? "s" : ""}`
                        : "Aucun indice"}
                    </div>
                    <div role="cell" data-label="Statut">
                      <span
                        className={`admin-contributions__status admin-contributions__status--${item.status.toLowerCase()}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <div role="cell" data-label="Action">
                      <a
                        className="admin-contributions__review"
                        href={`/admin/contributions/${item.id}`}
                      >
                        {item.status === "PENDING" ? "Examiner" : "Voir"}
                        <ArrowRight aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <footer className="admin-contributions__pagination">
                <p>
                  Page {data.page} sur {Math.max(1, data.totalPages)} ·{" "}
                  {data.total} résultat{data.total > 1 ? "s" : ""}
                </p>
                <div>
                  <Button
                    disabled={data.page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                    variant="outline"
                  >
                    Précédent
                  </Button>
                  <Button
                    disabled={data.page >= data.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    variant="outline"
                  >
                    Suivant
                  </Button>
                </div>
              </footer>
            </>
          ) : (
            <p className="admin-contributions__notice">
              {query
                ? "Aucun résultat sur cette page."
                : "Aucune contribution dans ce statut."}
            </p>
          ))}
      </div>
    </section>
  );
}
