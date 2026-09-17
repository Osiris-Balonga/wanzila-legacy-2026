import {
  adminAnalyticsQualityResponseSchema,
  type AdminAnalyticsQualityResponse,
} from "@wanzila/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Detail = AdminAnalyticsQualityResponse["data"];
type DetailState =
  | { status: "loading" }
  | { status: "success"; detail: Detail }
  | { status: "auth-required" | "forbidden" | "error" };

const sourcePageSize = 6;
const coveragePageSize = 5;
const count = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
const percent = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);

function observedDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

function snapshotDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

function DetailMessage({
  state,
  onRetry,
}: {
  state: DetailState;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <p aria-busy="true" role="status" className="analytics-detail-state">
        Chargement du détail…
      </p>
    );
  }
  if (state.status === "success") return null;
  if (state.status === "auth-required") {
    return (
      <div className="analytics-detail-state" role="alert">
        <strong>Connexion requise</strong>
        <p>Connectez-vous pour consulter le détail de qualité.</p>
        <a href="/admin/connexion">Aller à la connexion</a>
      </div>
    );
  }
  if (state.status === "forbidden") {
    return (
      <div className="analytics-detail-state" role="alert">
        <strong>Accès refusé</strong>
        <p>Vous n’avez pas l’autorisation de consulter ce détail.</p>
      </div>
    );
  }
  return (
    <div className="analytics-detail-state" role="alert">
      <strong>Détail indisponible</strong>
      <p>La réponse n’a pas pu être chargée ou validée.</p>
      <Button className="analytics-primary" onClick={onRetry} type="button">
        Réessayer
      </Button>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (value: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="analytics-detail-pagination">
      <Button
        aria-label="Page précédente"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
        variant="outline"
      >
        Précédent
      </Button>
      <span>
        Page {count(page)} sur {count(totalPages)}
      </span>
      <Button
        aria-label="Page suivante"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
        variant="outline"
      >
        Suivant
      </Button>
    </nav>
  );
}

function SourcesPanel({
  state,
  sourcePage,
  onSourcePageChange,
  onRetry,
}: {
  state: DetailState;
  sourcePage: number;
  onSourcePageChange: (value: number) => void;
  onRetry: () => void;
}) {
  const detail = state.status === "success" ? state.detail : null;
  const sources = detail?.sources;
  return (
    <section aria-label="Sources de planning" className="analytics-panel">
      <div className="analytics-panel__heading">
        <div>
          <h2>Sources de planning</h2>
          <p>Sources enregistrées et gardes en cours attribuées.</p>
        </div>
      </div>
      <DetailMessage state={state} onRetry={onRetry} />
      {detail && sources && (
        <>
          <p className="analytics-detail-snapshot">
            Instantané au {snapshotDate(detail.asOf)} : ces données sont
            indépendantes de la période d’activité.
          </p>
          <div className="analytics-detail-totals">
            <strong>{count(sources.totals.registered)} sources au total</strong>
            <span>{count(sources.totals.fresh)} à jour</span>
            <span>{count(sources.totals.stale)} en retard</span>
          </div>
          <p className="analytics-detail-summary">
            {count(sources.totals.currentDutyPeriodsAfterExceptions)} périodes
            de garde en cours après exceptions, dont{" "}
            {count(sources.totals.withSourceCurrentDutyPeriods)} périodes avec
            source et {count(sources.totals.withoutSourceCurrentDutyPeriods)}{" "}
            périodes sans source.
          </p>
          {sources.data.length === 0 ? (
            <p className="analytics-detail-state">
              {sources.pagination.total === 0
                ? "Aucune source enregistrée."
                : "Aucune source sur cette page."}
            </p>
          ) : (
            <>
              <p className="analytics-detail-scroll-hint">
                Faites défiler le tableau horizontalement pour voir toutes les
                colonnes.
              </p>
              <div
                aria-label="Défilement horizontal du tableau des sources"
                className="analytics-detail-table-scroll"
                role="region"
                tabIndex={0}
              >
                <table
                  aria-label="Sources de planning"
                  className="analytics-detail-table"
                >
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Observation</th>
                      <th scope="col">Fiabilité</th>
                      <th scope="col">Fraîcheur</th>
                      <th scope="col">Gardes en cours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.data.map((source) => (
                      <tr key={source.id}>
                        <th scope="row">
                          <strong>{source.name}</strong>
                          {source.description && (
                            <small>{source.description}</small>
                          )}
                        </th>
                        <td>
                          <time dateTime={source.observedAt}>
                            {observedDate(source.observedAt)}
                          </time>
                        </td>
                        <td>{count(source.reliability)}/100</td>
                        <td>
                          <span
                            className={`analytics-detail-freshness analytics-detail-freshness--${source.freshness.toLowerCase()}`}
                          >
                            {source.freshness === "FRESH"
                              ? "À jour"
                              : "En retard"}
                          </span>
                        </td>
                        <td>{count(source.currentApprovedDutyPeriods)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination
            onPageChange={onSourcePageChange}
            page={sourcePage}
            totalPages={sources.pagination.totalPages}
          />
          <p className="analytics-panel__footnote">
            Observation de la source, pas fréquence de synchronisation.
          </p>
        </>
      )}
    </section>
  );
}

function CoveragePanel({
  state,
  coveragePage,
  onCoveragePageChange,
  onRetry,
}: {
  state: DetailState;
  coveragePage: number;
  onCoveragePageChange: (value: number) => void;
  onRetry: () => void;
}) {
  const detail = state.status === "success" ? state.detail : null;
  const coverage = detail?.coverage;
  return (
    <section aria-label="Couverture des gardes" className="analytics-panel">
      <div className="analytics-panel__heading">
        <div>
          <h2>Couverture des gardes</h2>
          <p>Pharmacies publiées par arrondissement, à l’instant du rapport.</p>
        </div>
      </div>
      <DetailMessage state={state} onRetry={onRetry} />
      {detail && coverage && (
        <>
          <p className="analytics-detail-snapshot">
            Instantané au {snapshotDate(detail.asOf)} : ces données sont
            indépendantes de la période d’activité.
          </p>
          <div className="analytics-detail-totals">
            <strong>
              {count(coverage.totals.publishedPharmacies)} pharmacies publiées
            </strong>
            <span>
              {count(coverage.totals.withCurrentApprovedDuty)} avec garde
              approuvée en cours
            </span>
            {coverage.totals.ratio !== null && (
              <span>{percent(coverage.totals.ratio)} de couverture</span>
            )}
          </div>
          {coverage.data.length === 0 ? (
            <p className="analytics-detail-state">
              {coverage.pagination.total === 0
                ? "Aucune pharmacie publiée par arrondissement."
                : "Aucun arrondissement sur cette page."}
            </p>
          ) : (
            <ul className="analytics-detail-coverage">
              {coverage.data.map((row) => (
                <li key={row.arrondissement}>
                  <div className="analytics-detail-coverage__labels">
                    <strong>
                      {row.arrondissement || "Arrondissement non renseigné"}
                    </strong>
                    <span>
                      {count(row.withCurrentApprovedDuty)} sur{" "}
                      {count(row.publishedPharmacies)}
                      {row.ratio !== null && ` · ${percent(row.ratio)}`}
                    </span>
                  </div>
                  {row.ratio !== null && (
                    <div
                      aria-hidden="true"
                      className="analytics-detail-coverage__track"
                    >
                      <span style={{ width: `${row.ratio * 100}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            onPageChange={onCoveragePageChange}
            page={coveragePage}
            totalPages={coverage.pagination.totalPages}
          />
          <p className="analytics-panel__footnote">
            Pharmacies uniques avec garde approuvée en cours, après exceptions.
          </p>
        </>
      )}
    </section>
  );
}

export function useAdminQualityDetail(enabled: boolean) {
  const [activated, setActivated] = useState(false);
  const [sourcePage, setSourcePage] = useState(1);
  const [coveragePage, setCoveragePage] = useState(1);
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const requestVersion = useRef(0);

  useEffect(() => {
    if (enabled) setActivated(true);
  }, [enabled]);

  const load = useCallback(() => {
    const version = ++requestVersion.current;
    setState({ status: "loading" });
    void (async () => {
      let next: DetailState = { status: "error" };
      try {
        const query = new URLSearchParams({
          sourcePage: String(sourcePage),
          sourcePageSize: String(sourcePageSize),
          coveragePage: String(coveragePage),
          coveragePageSize: String(coveragePageSize),
        });
        const response = await fetch(
          `/api/v1/admin/analytics/quality?${query}`,
          {
            credentials: "include",
          },
        );
        if (response.status === 401) next = { status: "auth-required" };
        else if (response.status === 403) next = { status: "forbidden" };
        else if (response.ok) {
          const payload: unknown = await response.json();
          const parsed = adminAnalyticsQualityResponseSchema.safeParse(payload);
          if (
            parsed.success &&
            parsed.data.data.sources.pagination.page === sourcePage &&
            parsed.data.data.sources.pagination.pageSize === sourcePageSize &&
            parsed.data.data.coverage.pagination.page === coveragePage &&
            parsed.data.data.coverage.pagination.pageSize === coveragePageSize
          ) {
            next = { status: "success", detail: parsed.data.data };
          }
        }
      } catch {
        // Network and malformed payload failures share the recoverable state.
      }
      if (requestVersion.current === version) setState(next);
    })();
  }, [sourcePage, coveragePage]);

  useEffect(() => {
    if (activated) load();
    return () => {
      requestVersion.current += 1;
    };
  }, [activated, load]);

  return {
    state,
    sourcePage,
    coveragePage,
    setSourcePage,
    setCoveragePage,
    retry: load,
  };
}

export function AdminQualityDetailPanels({
  controller,
}: {
  controller: ReturnType<typeof useAdminQualityDetail>;
}) {
  return (
    <>
      <SourcesPanel
        onRetry={controller.retry}
        onSourcePageChange={controller.setSourcePage}
        sourcePage={controller.sourcePage}
        state={controller.state}
      />
      <CoveragePanel
        coveragePage={controller.coveragePage}
        onCoveragePageChange={controller.setCoveragePage}
        onRetry={controller.retry}
        state={controller.state}
      />
    </>
  );
}
