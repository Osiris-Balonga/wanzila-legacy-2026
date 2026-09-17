import type {
  ActivePublicPharmacy,
  PharmacyListResponse,
} from "@wanzila/contracts";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Map as MapIcon,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createAnalyticsTransport } from "@/analytics/transport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDiscoveryAnalytics } from "./discovery-analytics";
import { createDiscoveryClient } from "./discovery-client";
import {
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
} from "./discovery-url-state";
import type { DiscoveryLoadState, DiscoveryUrlState } from "./types";
import { DiscoveryMapPage } from "./map/DiscoveryMapPage";
import { toPharmacyFeatures } from "./map/pharmacy-map-features";
import "./discovery.css";

type DiscoveryPageProps = {
  state: Exclude<DiscoveryLoadState, { status: "idle" }>;
  filters: DiscoveryUrlState;
  onRetry: () => void;
  onSearchSubmit?: (query: string) => void;
  onFilterChange?: (
    field: "district" | "arrondissement",
    value: string,
  ) => void;
  onPageChange?: (page: number) => void;
  onMap?: () => void;
  selectedId?: string | null;
  onSelectMap?: (id: string) => void;
};

const districts = ["Plateau", "Poto-Poto", "Bacongo", "Moungali"];
const arrondissements = ["Poto-Poto", "Moungali", "Bacongo"];

function getResponse(
  state: DiscoveryPageProps["state"],
): PharmacyListResponse | undefined {
  return "response" in state ? state.response : undefined;
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function freshnessLabel(pharmacy: ActivePublicPharmacy): string {
  switch (pharmacy.currentDuty.sourceFreshness) {
    case "FRESH":
      return "Source actualisée";
    case "STALE":
      return "Données de source anciennes";
    case "UNKNOWN":
      return "Données de source inconnue";
  }
}

function PharmacyResult({
  pharmacy,
  selected,
  onShowOnMap,
}: {
  pharmacy: ActivePublicPharmacy;
  selected: boolean;
  onShowOnMap?: (() => void) | undefined;
}) {
  const source = pharmacy.currentDuty.source;
  return (
    <li className="discovery-result" data-selected={selected}>
      <a href={`/pharmacies/${pharmacy.id}`}>
        <div className="discovery-result__heading">
          <span className="discovery-result__icon" aria-hidden="true">
            <MapPin />
          </span>
          <span>
            <strong>{pharmacy.name}</strong>
            <span className="discovery-result__address">
              {pharmacy.address.line}
            </span>
          </span>
          <ChevronRight aria-hidden="true" />
        </div>
        <span className="discovery-result__metadata">
          <span>{pharmacy.address.district}</span>
          <span aria-hidden="true">·</span>
          <span>{pharmacy.address.arrondissement}</span>
        </span>
        <span className="discovery-result__duty">
          <Clock3 aria-hidden="true" />
          {pharmacy.currentDuty.sourceFreshness === "FRESH"
            ? "De garde jusqu’au "
            : "Garde indiquée jusqu’au "}
          {formatDate(pharmacy.currentDuty.endsAt)}
        </span>
        <span
          className={`discovery-result__freshness discovery-result__freshness--${pharmacy.currentDuty.sourceFreshness.toLowerCase()}`}
        >
          {freshnessLabel(pharmacy)}
          {source ? ` · ${source.name}` : ""}
        </span>
      </a>
      {onShowOnMap ? (
        <Button onClick={onShowOnMap} size="sm" type="button" variant="ghost">
          <MapIcon aria-hidden="true" /> Voir sur la carte
        </Button>
      ) : null}
    </li>
  );
}

function ResultStatus({ state }: { state: DiscoveryPageProps["state"] }) {
  const response = getResponse(state);
  if (state.status === "loading") {
    return <span>Recherche des pharmacies de garde…</span>;
  }
  if (state.status === "empty") {
    return <span>Aucune pharmacie trouvée</span>;
  }
  if (response) {
    return <span>{response.pagination.total} pharmacie(s) de garde</span>;
  }
  return <span>Résultats indisponibles</span>;
}

export function DiscoveryPage({
  state,
  filters,
  onRetry,
  onSearchSubmit,
  onFilterChange,
  onPageChange,
  onMap,
  selectedId,
  onSelectMap,
}: DiscoveryPageProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const response = getResponse(state);
  const isInvalid = state.status === "invalid-filter";

  useEffect(() => {
    setQuery(filters.q ?? "");
  }, [filters.q]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.(query);
  }

  return (
    <main className="discovery-page" id="public-content">
      <section
        className="discovery-page__hero"
        aria-labelledby="discovery-title"
      >
        <div className="discovery-page__title-row">
          <div>
            <p className="discovery-page__eyebrow">Pharma Garde</p>
            <h1 id="discovery-title">Pharmacies de garde</h1>
          </div>
          <span className="discovery-page__live-pill">
            <span aria-hidden="true" /> Gardes indiquées
          </span>
        </div>
        <form
          className="discovery-search"
          role="search"
          onSubmit={submitSearch}
        >
          <Label className="sr-only" htmlFor="discovery-search">
            Rechercher une pharmacie, un quartier
          </Label>
          <Search aria-hidden="true" />
          <Input
            aria-invalid={isInvalid || undefined}
            id="discovery-search"
            placeholder="Rechercher une pharmacie, un quartier"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            className="discovery-search__submit"
            tabIndex={-1}
            type="submit"
          >
            Rechercher
          </Button>
        </form>
        <div className="discovery-filters" aria-label="Filtres de recherche">
          <div className="discovery-filter">
            <MapPin aria-hidden="true" />
            <Label htmlFor="discovery-district">Quartier</Label>
            <select
              id="discovery-district"
              value={filters.district ?? ""}
              onChange={(event) =>
                onFilterChange?.("district", event.target.value)
              }
            >
              <option value="">Tous les quartiers</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </div>
          <div className="discovery-filter">
            <Building2 aria-hidden="true" />
            <Label htmlFor="discovery-arrondissement">Arrondissement</Label>
            <select
              id="discovery-arrondissement"
              value={filters.arrondissement ?? ""}
              onChange={(event) =>
                onFilterChange?.("arrondissement", event.target.value)
              }
            >
              <option value="">Tous les arrondissements</option>
              {arrondissements.map((arrondissement) => (
                <option key={arrondissement} value={arrondissement}>
                  {arrondissement}
                </option>
              ))}
            </select>
          </div>
        </div>
        {onMap ? (
          <Button
            className="discovery-page__map-link"
            onClick={onMap}
            type="button"
            variant="outline"
          >
            <MapIcon aria-hidden="true" /> Carte
          </Button>
        ) : null}
      </section>

      <section
        className="discovery-results"
        aria-labelledby="discovery-results-title"
      >
        <div className="discovery-results__header">
          <div>
            <p className="discovery-page__eyebrow">À proximité</p>
            <h2 id="discovery-results-title">Résultats de garde</h2>
          </div>
          <p aria-live="polite" className="discovery-results__count">
            <ResultStatus state={state} />
          </p>
        </div>

        {state.status === "loading" ? (
          <div aria-busy="true" className="discovery-skeletons">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {state.status === "invalid-filter" ? (
          <Alert variant="destructive">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Filtre invalide</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        {state.status === "empty" ? (
          <Alert>
            <Search aria-hidden="true" />
            <AlertTitle>Aucune pharmacie trouvée</AlertTitle>
            <AlertDescription>
              Modifiez votre recherche ou élargissez les filtres géographiques.
            </AlertDescription>
          </Alert>
        ) : null}

        {state.status === "error" ? (
          <Alert variant="destructive">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Les résultats ne sont pas disponibles</AlertTitle>
            <AlertDescription>
              Vérifiez votre connexion puis relancez la recherche.
            </AlertDescription>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              Réessayer
            </Button>
          </Alert>
        ) : null}

        {state.status === "uncertain-data" ? (
          <Alert className="discovery-uncertain-alert">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Informations à vérifier</AlertTitle>
            <AlertDescription>
              Données de source inconnue ou anciennes : confirmez la
              disponibilité avant votre déplacement.
            </AlertDescription>
          </Alert>
        ) : null}

        {response && response.data.length > 0 ? (
          <ul
            aria-label="Résultats de pharmacies de garde"
            className="discovery-result-list"
          >
            {response.data.map((pharmacy) => (
              <PharmacyResult
                key={pharmacy.id}
                onShowOnMap={
                  toPharmacyFeatures([pharmacy]).features.length > 0 &&
                  onSelectMap
                    ? () => onSelectMap(pharmacy.id)
                    : undefined
                }
                pharmacy={pharmacy}
                selected={pharmacy.id === selectedId}
              />
            ))}
          </ul>
        ) : null}

        {response && response.pagination.totalPages > 1 ? (
          <nav
            aria-label="Pagination des résultats"
            className="discovery-pagination"
          >
            <Button
              aria-label="Page précédente"
              disabled={filters.page <= 1}
              size="icon"
              type="button"
              variant="outline"
              onClick={() => onPageChange?.(filters.page - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            {Array.from(
              { length: response.pagination.totalPages },
              (_, index) => index + 1,
            ).map((page) => (
              <Button
                aria-current={page === filters.page ? "page" : undefined}
                aria-label={`Page ${page}`}
                key={page}
                type="button"
                variant={page === filters.page ? "default" : "outline"}
                onClick={() => onPageChange?.(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              aria-label="Page suivante"
              disabled={filters.page >= response.pagination.totalPages}
              size="icon"
              type="button"
              variant="outline"
              onClick={() => onPageChange?.(filters.page + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function analyticsFailureCode(
  state: DiscoveryLoadState,
): "NETWORK_ERROR" | "REQUEST_TIMEOUT" | "SERVICE_UNAVAILABLE" {
  return state.status === "error" && state.code === "NETWORK_ERROR"
    ? "NETWORK_ERROR"
    : "SERVICE_UNAVAILABLE";
}

export function DiscoveryRoute() {
  const client = useMemo(
    () => createDiscoveryClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [],
  );
  const transport = useMemo(
    () =>
      createAnalyticsTransport({
        endpoint: "/api/v1/analytics/events",
      }),
    [],
  );
  const analytics = useMemo(
    () =>
      createDiscoveryAnalytics({
        track: (event) => transport.track({ ...event, schemaVersion: 1 }),
      }),
    [transport],
  );
  const initialFilters = useMemo(
    () => parseDiscoveryUrlState(globalThis.location.search),
    [],
  );
  const [filters, setFilters] = useState<DiscoveryUrlState>(initialFilters);
  const [mode, setMode] = useState<"list" | "map">(
    globalThis.location.hash === "#list" ? "list" : "map",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<
    Exclude<DiscoveryLoadState, { status: "idle" }>
  >({
    status: "loading",
  });
  const viewed = useRef(false);
  const emptyQuery = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);

  const load = useCallback(
    async (nextFilters: DiscoveryUrlState) => {
      const version = ++requestVersion.current;
      setState({ status: "loading" });
      const nextState = await client.load(nextFilters);
      if (version !== requestVersion.current || nextState.status === "idle") {
        return;
      }
      setState(nextState);
      if (nextState.status === "empty") {
        const query = nextFilters.q ?? "";
        if (emptyQuery.current !== query) {
          analytics.showedEmptyResults(query);
          emptyQuery.current = query;
        }
      } else {
        emptyQuery.current = undefined;
      }
      if (nextState.status === "error") {
        analytics.failed(analyticsFailureCode(nextState));
      }
    },
    [analytics, client],
  );

  const navigate = useCallback(
    (nextFilters: DiscoveryUrlState) => {
      const search = serializeDiscoveryUrlState(nextFilters);
      globalThis.history.pushState(
        {},
        "",
        `${globalThis.location.pathname}${search}${globalThis.location.hash}`,
      );
      setFilters(nextFilters);
      void load(nextFilters);
    },
    [load],
  );

  useEffect(() => {
    if (!viewed.current) {
      analytics.viewed();
      viewed.current = true;
    }
    void load(initialFilters);
  }, [analytics, initialFilters, load]);

  useEffect(() => {
    const restoreFromHistory = () => {
      const restored = parseDiscoveryUrlState(globalThis.location.search);
      setMode(globalThis.location.hash === "#list" ? "list" : "map");
      setFilters(restored);
      void load(restored);
    };
    globalThis.addEventListener("popstate", restoreFromHistory);
    globalThis.addEventListener("hashchange", restoreFromHistory);
    return () => {
      globalThis.removeEventListener("popstate", restoreFromHistory);
      globalThis.removeEventListener("hashchange", restoreFromHistory);
    };
  }, [load]);

  const showMode = (nextMode: "list" | "map") => {
    globalThis.history.pushState(
      {},
      "",
      `${globalThis.location.pathname}${globalThis.location.search}${nextMode === "list" ? "#list" : ""}`,
    );
    setMode(nextMode);
  };
  const onRetry = () => void load(filters);
  const onSearchSubmit = (query: string) => {
    analytics.submittedSearch(query);
    const filtersWithoutQuery = { ...filters };
    delete filtersWithoutQuery.q;
    const normalizedQuery = query.trim();
    navigate({
      ...filtersWithoutQuery,
      ...(normalizedQuery === "" ? {} : { q: normalizedQuery }),
      page: 1,
    });
  };
  const onFilterChange = (
    field: "district" | "arrondissement",
    value: string,
  ) => {
    const nextFilters =
      field === "district"
        ? (() => {
            const withoutDistrict = { ...filters };
            delete withoutDistrict.district;
            return {
              ...withoutDistrict,
              ...(value === "" ? {} : { district: value }),
              page: 1,
            };
          })()
        : (() => {
            const withoutArrondissement = { ...filters };
            delete withoutArrondissement.arrondissement;
            return {
              ...withoutArrondissement,
              ...(value === "" ? {} : { arrondissement: value }),
              page: 1,
            };
          })();
    analytics.appliedFilters({
      ...(nextFilters.district === undefined
        ? {}
        : { district: nextFilters.district }),
      ...(nextFilters.arrondissement === undefined
        ? {}
        : { arrondissement: nextFilters.arrondissement }),
    });
    navigate(nextFilters);
  };

  return mode === "map" ? (
    <DiscoveryMapPage
      filters={filters}
      onClearSelection={() => setSelectedId(null)}
      onFilterChange={onFilterChange}
      onList={() => showMode("list")}
      onRetry={onRetry}
      onSearchSubmit={onSearchSubmit}
      onSelect={setSelectedId}
      selectedId={selectedId}
      state={state}
    />
  ) : (
    <DiscoveryPage
      filters={filters}
      onFilterChange={onFilterChange}
      onMap={() => showMode("map")}
      onSelectMap={(id) => {
        setSelectedId(id);
        showMode("map");
      }}
      onRetry={onRetry}
      onSearchSubmit={onSearchSubmit}
      onPageChange={(page) => navigate({ ...filters, page })}
      state={state}
      selectedId={selectedId}
    />
  );
}
