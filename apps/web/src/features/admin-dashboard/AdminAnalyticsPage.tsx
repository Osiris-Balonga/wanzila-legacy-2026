import type {
  AdminAnalyticsActivityMetricName,
  AdminAnalyticsActivityResponse,
  AdminAnalyticsOverviewResponse,
} from "@wanzila/contracts";
import { ChartBarIcon } from "@phosphor-icons/react/ChartBar";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { DatabaseIcon } from "@phosphor-icons/react/Database";
import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { NavigationArrowIcon } from "@phosphor-icons/react/NavigationArrow";
import { PhoneIcon } from "@phosphor-icons/react/Phone";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { UsersThreeIcon } from "@phosphor-icons/react/UsersThree";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { useState, type ComponentType, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminActivityMap } from "./AdminActivityMap";
import { useAdminDashboardActivity } from "./useAdminDashboardActivity";
import {
  AdminQualityDetailPanels,
  useAdminQualityDetail,
} from "./AdminQualityDetailPanels";
import "./admin-analytics.css";

type Overview = AdminAnalyticsOverviewResponse["data"];
type Activity = AdminAnalyticsActivityResponse["data"];
type EventName = AdminAnalyticsActivityMetricName;
type AnalyticsWindow = "7d" | "30d";

export type AnalyticsPageState =
  | { status: "loading" }
  | { status: "success" | "empty"; overview: Overview }
  | { status: "auth-required" | "forbidden" }
  | { status: "error" };

export interface AnalyticsPageProps {
  state: AnalyticsPageState;
  window: AnalyticsWindow;
  onWindowChange: (value: AnalyticsWindow) => void;
  onRetry: () => void;
  retrying?: boolean;
}

const count = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
const eventMetrics: Array<{
  key: EventName;
  label: string;
  Icon: ComponentType<{ weight?: "fill"; "aria-hidden"?: boolean }>;
}> = [
  { key: "discovery_viewed", label: "Visites", Icon: UsersThreeIcon },
  { key: "search_submitted", label: "Recherches", Icon: MagnifyingGlassIcon },
  {
    key: "pharmacy_detail_viewed",
    label: "Fiches consultées",
    Icon: FileTextIcon,
  },
  { key: "pharmacy_call_started", label: "Appels", Icon: PhoneIcon },
  { key: "route_started", label: "Itinéraires", Icon: NavigationArrowIcon },
  {
    key: "arrival_confirmed",
    label: "Confirmations d’arrivée",
    Icon: CheckCircleIcon,
  },
];

function AnalyticsHeader({
  title,
  description,
  window,
  onWindowChange,
}: {
  title: string;
  description: string;
  window: AnalyticsWindow;
  onWindowChange: (value: AnalyticsWindow) => void;
}) {
  return (
    <header className="analytics-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <label className="analytics-period">
        <span className="sr-only">Période</span>
        <select
          aria-label="Période"
          name="window"
          onChange={(event) =>
            onWindowChange(event.target.value as AnalyticsWindow)
          }
          value={window}
        >
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
        </select>
      </label>
    </header>
  );
}

function AnalyticsBody({
  state,
  onRetry,
  retrying,
  emptyMessage,
  children,
}: {
  state: AnalyticsPageState;
  onRetry: () => void;
  retrying: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  if (state.status === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label="Chargement des données analytiques"
        className="analytics-loading"
        role="status"
      >
        <p>Chargement des données analytiques…</p>
        <div aria-hidden="true" className="analytics-loading__bars">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }
  if (state.status === "auth-required") {
    return (
      <div className="analytics-error" role="alert">
        <WarningCircleIcon aria-hidden="true" weight="fill" />
        <div>
          <h2>Connexion requise</h2>
          <p>Connectez-vous pour consulter les données analytiques.</p>
          <a className="analytics-login-link" href="/admin/connexion">
            Aller à la connexion
          </a>
        </div>
      </div>
    );
  }
  if (state.status === "forbidden") {
    return (
      <div className="analytics-error" role="alert">
        <WarningCircleIcon aria-hidden="true" weight="fill" />
        <div>
          <h2>Accès refusé</h2>
          <p>
            Vous n’avez pas l’autorisation requise pour consulter ce rapport.
          </p>
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="analytics-error" role="alert">
        <WarningCircleIcon aria-hidden="true" weight="fill" />
        <div>
          <h2>Données indisponibles</h2>
          <p>
            Les données analytiques sont indisponibles. Réessayez pour
            actualiser la page.
          </p>
          <Button
            className="analytics-primary"
            disabled={retrying}
            onClick={onRetry}
          >
            Réessayer
          </Button>
          {retrying ? (
            <span className="sr-only" role="status">
              Chargement en cours
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <>
      {state.status === "empty" ? (
        <p className="analytics-empty" role="status">
          {emptyMessage}
        </p>
      ) : null}
      {children}
    </>
  );
}

function MiniSeries({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 100},${31 - (value / max) * 25}`,
    )
    .join(" ");
  return (
    <svg
      aria-label={`Évolution quotidienne : ${label}`}
      className="analytics-mini-series"
      role="img"
      viewBox="0 0 100 36"
    >
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

const delta = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value)} %`;

function snapshotTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(value));
}

function DashboardMetrics({
  overview,
  activity,
}: {
  overview: Overview;
  activity: Activity;
}) {
  const countsDiverge = eventMetrics.some(
    ({ key }) =>
      activity.comparisons[key].current !== overview.events.totals[key],
  );
  return (
    <section
      aria-label="Indicateurs d’activité"
      className="analytics-metrics analytics-metrics--six"
    >
      {eventMetrics.map(({ key, label, Icon }) => (
        <Card className="analytics-metric" key={key}>
          <CardContent>
            <span aria-hidden="true" className="analytics-metric__icon">
              <Icon weight="fill" />
            </span>
            <strong>{count(activity.comparisons[key].current)}</strong>
            <span>{label}</span>
            <small className="analytics-metric__delta">
              {activity.comparisons[key].deltaPercent === null
                ? "Comparaison indisponible"
                : `${delta(activity.comparisons[key].deltaPercent)} vs période précédente`}
            </small>
            {countsDiverge ? null : (
              <MiniSeries
                label={label}
                values={overview.events.daily.map((day) => day.counts[key])}
              />
            )}
          </CardContent>
        </Card>
      ))}
      <p className="analytics-metrics__context">
        KPI au {snapshotTime(activity.period.asOf)} · comparaison avec la
        période précédente de même durée.
        {countsDiverge ? (
          <span>
            {" "}
            Instantanés distincts : les séries et le tunnel ci-dessous
            proviennent du rapport au {snapshotTime(overview.period.asOf)}.
            Leurs comptes peuvent différer des KPI ; leurs courbes ne sont pas
            accolées aux KPI.
          </span>
        ) : null}
      </p>
    </section>
  );
}

function Funnel({ overview }: { overview: Overview }) {
  const max = Math.max(
    1,
    ...eventMetrics.map(({ key }) => overview.events.totals[key]),
  );
  return (
    <section
      aria-label="Tunnel d’activité"
      className="analytics-panel analytics-funnel"
    >
      <div className="analytics-panel__heading">
        <div>
          <h2>Tunnel d’activité</h2>
          <p>Volumes d’événements, sans taux de conversion supposé.</p>
        </div>
      </div>
      <div aria-hidden="true" className="analytics-funnel__chart">
        {eventMetrics.map(({ key, label }) => (
          <div className="analytics-funnel__item" key={key}>
            <strong>{count(overview.events.totals[key])}</strong>
            <div className="analytics-funnel__track">
              <span
                style={
                  {
                    "--analytics-ratio": `${(overview.events.totals[key] / max) * 100}%`,
                  } as CSSProperties
                }
              />
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="analytics-accessible-tables">
        <table aria-label="Tunnel d’activité">
          <caption>Volumes par type d’événement</caption>
          <thead>
            <tr>
              <th>Événement</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
            {eventMetrics.map(({ key, label }) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td>{overview.events.totals[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table aria-label="Activité quotidienne">
          <caption>Événements quotidiens sur la période</caption>
          <thead>
            <tr>
              <th>Date</th>
              {eventMetrics.map(({ key, label }) => (
                <th key={key}>{label}</th>
              ))}
              <th>Résultats vides</th>
            </tr>
          </thead>
          <tbody>
            {overview.events.daily.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.date}</th>
                {eventMetrics.map(({ key }) => (
                  <td key={key}>{day.counts[key]}</td>
                ))}
                <td>{day.counts.empty_results_shown}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analytics-panel__footnote">
        {count(overview.events.totals.empty_results_shown)} recherches sans
        résultat · événements mesurés.
      </p>
    </section>
  );
}

function TopPharmacies({ overview }: { overview: Overview }) {
  return (
    <section
      aria-label="Pharmacies les plus consultées"
      className="analytics-panel"
    >
      <div className="analytics-panel__heading">
        <h2>Pharmacies les plus consultées</h2>
      </div>
      {overview.topPharmacies.length === 0 ? (
        <p className="analytics-unavailable">
          Aucune consultation de fiche pharmacie sur cette période.
        </p>
      ) : (
        <ol className="analytics-top-list">
          {overview.topPharmacies.map((pharmacy) => (
            <li key={pharmacy.pharmacyId}>
              <span aria-hidden="true" className="analytics-rank" />
              {pharmacy.name === null ? (
                <span className="analytics-top-list__unavailable">
                  Pharmacie indisponible
                </span>
              ) : (
                <a href={`/admin/pharmacies/${pharmacy.pharmacyId}`}>
                  {pharmacy.name}
                </a>
              )}
              <span>{count(pharmacy.detailViews)} consultations</span>
            </li>
          ))}
        </ol>
      )}
      <p className="analytics-panel__footnote">
        Classement basé uniquement sur les consultations de fiches mesurées.
      </p>
    </section>
  );
}

function FilterUsage({ overview }: { overview: Overview }) {
  const [kind, setKind] = useState<"districts" | "arrondissements">(
    "districts",
  );
  const items = overview.filterUsage[kind];
  const max = Math.max(1, ...items.map((item) => item.applications));
  return (
    <section aria-label="Utilisation des filtres" className="analytics-panel">
      <div className="analytics-panel__heading">
        <div>
          <h2>Utilisation des filtres</h2>
          <p>Applications de filtre, pas géographie des recherches.</p>
        </div>
      </div>
      <div
        aria-label="Dimension des filtres"
        className="analytics-segment"
        role="group"
      >
        <button
          aria-pressed={kind === "districts"}
          onClick={() => setKind("districts")}
          type="button"
        >
          Par quartier
        </button>
        <button
          aria-pressed={kind === "arrondissements"}
          onClick={() => setKind("arrondissements")}
          type="button"
        >
          Par arrondissement
        </button>
      </div>
      {items.length === 0 ? (
        <p className="analytics-unavailable">
          Aucune application de filtre mesurée.
        </p>
      ) : (
        <ul className="analytics-bars">
          {items.map((item) => (
            <li key={item.value}>
              <span>{item.value}</span>
              <span aria-hidden="true" className="analytics-bars__track">
                <span
                  style={{ width: `${(item.applications / max) * 100}%` }}
                />
              </span>
              <strong>{count(item.applications)}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="analytics-accessible-tables">
        <table aria-label="Principales applications de filtres">
          <caption>Principaux quartiers et arrondissements filtrés</caption>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Valeur</th>
              <th>Applications de filtre</th>
            </tr>
          </thead>
          <tbody>
            {overview.filterUsage.districts.map((item) => (
              <tr key={`district-${item.value}`}>
                <th scope="row">Quartier</th>
                <td>{item.value}</td>
                <td>{item.applications}</td>
              </tr>
            ))}
            {overview.filterUsage.arrondissements.map((item) => (
              <tr key={`arrondissement-${item.value}`}>
                <th scope="row">Arrondissement</th>
                <td>{item.value}</td>
                <td>{item.applications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analytics-panel__footnote">
        {kind === "districts" ? "Quartiers" : "Arrondissements"} · applications
        de filtre.
      </p>
    </section>
  );
}

function DashboardAlerts({ overview }: { overview: Overview }) {
  const { quality } = overview;
  return (
    <section
      aria-label="Alertes et actions à traiter"
      className="analytics-panel"
    >
      <div className="analytics-panel__heading">
        <h2>Alertes et actions à traiter</h2>
      </div>
      <div className="analytics-alert-list">
        <div>
          <FileTextIcon aria-hidden="true" weight="fill" />
          <span>
            {count(quality.pendingContributions)} contributions en attente
          </span>
        </div>
        <div>
          <WarningCircleIcon aria-hidden="true" weight="fill" />
          <span>
            {count(quality.unresolvedReports)} signalements non résolus
          </span>
        </div>
        <a href="/admin/qualite">
          <DatabaseIcon aria-hidden="true" weight="fill" />
          <span>
            {count(quality.registeredSources.stale)} sources en retard
          </span>
        </a>
      </div>
      <p className="analytics-unavailable">
        Gestion des contributions et signalements bientôt disponible. Détail des
        priorités et dates de détection indisponible.
      </p>
    </section>
  );
}

function DashboardQuality({ overview }: { overview: Overview }) {
  const { quality } = overview;
  return (
    <section
      aria-label="Qualité des données"
      className="analytics-panel analytics-quality-mini"
    >
      <div className="analytics-panel__heading">
        <h2>Qualité des données</h2>
      </div>
      <div className="analytics-quality-mini__number">
        <strong>{count(quality.currentDutyPeriodsAfterExceptions)}</strong>
        <span>gardes en cours après exceptions</span>
      </div>
      <dl>
        <div>
          <dt>Sources fraîches</dt>
          <dd>{count(quality.registeredSources.fresh)}</dd>
        </div>
        <div>
          <dt>Sources en retard</dt>
          <dd>{count(quality.registeredSources.stale)}</dd>
        </div>
        <div>
          <dt>Pharmacies publiées</dt>
          <dd>{count(quality.publishedPharmacies)}</dd>
        </div>
      </dl>
      <p className="analytics-panel__footnote">
        Aucun score global de qualité calculable avec ces données.
      </p>
    </section>
  );
}

export function AdminDashboardPage({
  state,
  window,
  onWindowChange,
  onRetry,
  retrying = false,
}: AnalyticsPageProps) {
  const activity = useAdminDashboardActivity(
    window,
    state.status === "success" || state.status === "empty",
  );
  return (
    <div className="admin-analytics">
      <AnalyticsHeader
        description="Vue d’ensemble de l’activité et de la qualité des données."
        onWindowChange={onWindowChange}
        title="Dashboard"
        window={window}
      />
      <AnalyticsBody
        emptyMessage="Aucune activité ni donnée opérationnelle pour cette période."
        onRetry={onRetry}
        retrying={retrying}
        state={state}
      >
        {(state.status === "success" || state.status === "empty") && (
          <>
            {activity.state.status === "loading" ? (
              <p
                aria-label="Chargement de l’activité"
                className="analytics-loading analytics-activity-loading"
                role="status"
              >
                Chargement de l’activité…
              </p>
            ) : activity.state.status === "auth-required" ? (
              <div className="analytics-error" role="alert">
                <WarningCircleIcon aria-hidden="true" weight="fill" />
                <div>
                  <h2>Connexion requise</h2>
                  <p>
                    Connectez-vous pour consulter les comparaisons et la carte
                    d’activité.
                  </p>
                  <a className="analytics-login-link" href="/admin/connexion">
                    Aller à la connexion
                  </a>
                </div>
              </div>
            ) : activity.state.status === "forbidden" ? (
              <div className="analytics-error" role="alert">
                <WarningCircleIcon aria-hidden="true" weight="fill" />
                <div>
                  <h2>Accès refusé</h2>
                  <p>
                    Vous n’avez pas l’autorisation de consulter les comparaisons
                    et la carte d’activité.
                  </p>
                </div>
              </div>
            ) : activity.state.status === "error" ? (
              <div className="analytics-error" role="alert">
                <WarningCircleIcon aria-hidden="true" weight="fill" />
                <div>
                  <h2>Activité indisponible</h2>
                  <p>
                    La réponse des comparaisons et de la carte n’a pas pu être
                    chargée ou validée.
                  </p>
                  <Button
                    className="analytics-primary"
                    onClick={activity.retry}
                    type="button"
                  >
                    Réessayer
                  </Button>
                </div>
              </div>
            ) : activity.state.status === "success" ? (
              <DashboardMetrics
                activity={activity.state.activity}
                overview={state.overview}
              />
            ) : null}
            <div className="analytics-grid analytics-grid--dashboard-top">
              <Funnel overview={state.overview} />
              <TopPharmacies overview={state.overview} />
              <FilterUsage overview={state.overview} />
            </div>
            <div className="analytics-grid analytics-grid--dashboard-bottom">
              {activity.state.status === "success" ? (
                <section
                  aria-label="Carte d’activité"
                  className="analytics-panel analytics-map-panel"
                >
                  <div className="analytics-panel__heading">
                    <div>
                      <h2>Carte d’activité</h2>
                      <p>
                        Consultations de fiches sur les pharmacies publiées
                        géocodées.
                      </p>
                    </div>
                  </div>
                  <AdminActivityMap
                    onPageChange={activity.setPage}
                    pharmacyActivity={activity.state.activity.pharmacyActivity}
                  />
                  <p className="analytics-panel__footnote">
                    Points statiques agrégés par pharmacie, sans position de
                    visiteur ni carte de chaleur.
                  </p>
                </section>
              ) : null}
              <DashboardAlerts overview={state.overview} />
              <DashboardQuality overview={state.overview} />
            </div>
          </>
        )}
      </AnalyticsBody>
    </div>
  );
}

function QualityMetrics({ overview }: { overview: Overview }) {
  const { quality } = overview;
  const metrics = [
    {
      label: "Sources à jour",
      value: quality.registeredSources.fresh,
      Icon: DatabaseIcon,
    },
    {
      label: "Sources en retard",
      value: quality.registeredSources.stale,
      Icon: WarningCircleIcon,
    },
    {
      label: "Gardes après exceptions",
      value: quality.currentDutyPeriodsAfterExceptions,
      Icon: ShieldCheckIcon,
    },
    {
      label: "Pharmacies publiées",
      value: quality.publishedPharmacies,
      Icon: ChartBarIcon,
    },
  ];
  return (
    <section
      aria-label="Indicateurs de qualité"
      className="analytics-metrics analytics-metrics--four"
    >
      {metrics.map(({ label, value, Icon }) => (
        <Card className="analytics-metric" key={label}>
          <CardContent>
            <span aria-hidden="true" className="analytics-metric__icon">
              <Icon weight="fill" />
            </span>
            <strong>{count(value)}</strong>
            <span>{label}</span>
            <small>Comptage à l’instant du rapport</small>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function FreshnessBreakdown({ overview }: { overview: Overview }) {
  const freshness = overview.quality.currentDutySourceFreshness;
  const total = freshness.fresh + freshness.stale + freshness.unknown;
  const rows = [
    ["Fraîche", freshness.fresh, "fresh"],
    ["Périmée", freshness.stale, "stale"],
    ["Inconnue", freshness.unknown, "unknown"],
  ] as const;
  return (
    <section aria-label="Qualité des données" className="analytics-panel">
      <div className="analytics-panel__heading">
        <div>
          <h2>Qualité des données</h2>
          <p>Fraîcheur des sources de gardes en cours.</p>
        </div>
      </div>
      <div aria-hidden="true" className="analytics-freshness-bar">
        {rows.map(([label, value, kind]) => (
          <span
            className={`analytics-freshness-bar__${kind}`}
            key={label}
            style={
              {
                width: `${total === 0 ? 0 : (value / total) * 100}%`,
              } satisfies CSSProperties
            }
          />
        ))}
      </div>
      <dl className="analytics-coverage">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count(value)}</dd>
          </div>
        ))}
        <div>
          <dt>Total</dt>
          <dd>{count(total)}</dd>
        </div>
      </dl>
      <p className="analytics-panel__footnote">
        Aucun pourcentage global de qualité n’est dérivé de ces comptes.
      </p>
    </section>
  );
}

function PendingActions({ overview }: { overview: Overview }) {
  const { quality } = overview;
  return (
    <section aria-label="Actions en attente" className="analytics-panel">
      <div className="analytics-panel__heading">
        <h2>Actions en attente</h2>
      </div>
      <div className="analytics-alert-list">
        <div>
          <FileTextIcon aria-hidden="true" weight="fill" />
          <span>
            {count(quality.pendingContributions)} contributions en attente
          </span>
        </div>
        <div>
          <WarningCircleIcon aria-hidden="true" weight="fill" />
          <span>
            {count(quality.unresolvedReports)} signalements non résolus
          </span>
        </div>
      </div>
      <p className="analytics-unavailable">
        Gestion des contributions et signalements bientôt disponible.
      </p>
    </section>
  );
}

function AnomalySummary() {
  return (
    <section aria-label="Anomalies à traiter" className="analytics-panel">
      <div className="analytics-panel__heading">
        <h2>Anomalies à traiter</h2>
      </div>
      <p className="analytics-unavailable">
        Détection des anomalies indisponible dans ce rapport. Aucun décompte
        d’anomalies n’est déduit des actions en attente.
      </p>
    </section>
  );
}

export function AdminDataQualityPage({
  state,
  window,
  onWindowChange,
  onRetry,
  retrying = false,
}: AnalyticsPageProps) {
  const detail = useAdminQualityDetail(
    state.status === "success" || state.status === "empty",
  );
  return (
    <div className="admin-analytics">
      <AnalyticsHeader
        description="Suivi de la fraîcheur des sources et des informations sur les gardes."
        onWindowChange={onWindowChange}
        title="Sources & qualité des données"
        window={window}
      />
      <AnalyticsBody
        emptyMessage="Aucune activité sur cette période ; les détails de qualité ci-dessous sont des instantanés."
        onRetry={onRetry}
        retrying={retrying}
        state={state}
      >
        {(state.status === "success" || state.status === "empty") && (
          <>
            <QualityMetrics overview={state.overview} />
            <div className="analytics-grid analytics-grid--quality-top">
              <AdminQualityDetailPanels controller={detail} />
            </div>
            <div className="analytics-grid analytics-grid--quality-bottom">
              <FreshnessBreakdown overview={state.overview} />
              <div className="analytics-quality-side">
                <PendingActions overview={state.overview} />
                <AnomalySummary />
              </div>
            </div>
          </>
        )}
      </AnalyticsBody>
    </div>
  );
}
