import type {
  AdminDuty,
  AdminDutyRevision,
  AdminPharmacy,
  AdminScheduleSource,
} from "@wanzila/contracts";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { FirstAidKitIcon } from "@phosphor-icons/react/FirstAidKit";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  address,
  dateLabel,
  durationLabel,
  sourceName,
  toInstant,
  type LocalFields,
} from "./admin-duty-edit-format";
import type { loadDutyRevisions } from "./admin-duty-client";
import { DutyLocationMap } from "./DutyLocationMap";

type RevisionPage = Awaited<ReturnType<typeof loadDutyRevisions>>;
export type ReviewTarget = {
  action: "approve" | "reject";
  revision: AdminDutyRevision;
};

function HistoryEntry({
  revision,
  sources,
  onReview,
}: {
  revision: AdminDutyRevision;
  sources: AdminScheduleSource[];
  onReview: (target: ReviewTarget, trigger: HTMLButtonElement) => void;
}) {
  const status =
    revision.status === "PENDING"
      ? "En attente"
      : revision.status === "APPROVED"
        ? "Approuvée"
        : "Rejetée";
  return (
    <li className="admin-duty-edit__history-entry">
      <div className="admin-duty-edit__history-head">
        <div>
          <strong>{status}</strong>
          <span>Soumise le {dateLabel(revision.submittedAt)}</span>
        </div>
        <Badge variant="secondary">{status}</Badge>
      </div>
      <p>
        Soumise par {revision.submittedBy.displayName} ·{" "}
        {revision.submissionNote}
      </p>
      <dl className="admin-duty-edit__changes">
        <div>
          <dt>Début</dt>
          <dd>
            {dateLabel(revision.before.startsAt)} →{" "}
            {dateLabel(revision.proposed.startsAt)}
          </dd>
        </div>
        <div>
          <dt>Fin</dt>
          <dd>
            {dateLabel(revision.before.endsAt)} →{" "}
            {dateLabel(revision.proposed.endsAt)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {sourceName(sources, revision.before.sourceId)} →{" "}
            {sourceName(sources, revision.proposed.sourceId)}
          </dd>
        </div>
      </dl>
      {revision.reviewedBy && revision.reviewedAt ? (
        <p className="admin-duty-edit__review-audit">
          {status} par {revision.reviewedBy.displayName} le{" "}
          {dateLabel(revision.reviewedAt)}
          {revision.reviewNote ? ` · ${revision.reviewNote}` : ""}
        </p>
      ) : null}
      {revision.status === "PENDING" ? (
        <div className="admin-duty-edit__review-actions">
          <Button
            onClick={(event) =>
              onReview({ action: "approve", revision }, event.currentTarget)
            }
            type="button"
            variant="outline"
          >
            <Check aria-hidden="true" />
            Approuver la révision
          </Button>
          <Button
            onClick={(event) =>
              onReview({ action: "reject", revision }, event.currentTarget)
            }
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Rejeter la révision
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function DutyEditSidebar({
  duty,
  pharmacy,
  sources,
  revisions,
  fields,
  historyBusy,
  onReview,
  onHistoryPage,
}: {
  duty: AdminDuty;
  pharmacy: AdminPharmacy;
  sources: AdminScheduleSource[];
  revisions: RevisionPage | null;
  fields: LocalFields;
  historyBusy: boolean;
  onReview: (target: ReviewTarget, trigger: HTMLButtonElement) => void;
  onHistoryPage: (page: number) => void;
}) {
  const startsAt = toInstant(fields.startDate, fields.startTime);
  const endsAt = toInstant(fields.endDate, fields.endTime);
  return (
    <aside
      aria-label="Pharmacie et historique"
      className="admin-duty-edit__side"
    >
      <section
        aria-label="Pharmacie"
        className="admin-duty-edit__side-card admin-duty-edit__pharmacy-card"
      >
        <div className="admin-duty-edit__side-heading">
          <h2>Pharmacie</h2>
          <a href={`/admin/pharmacies/${pharmacy.id}`}>Voir la fiche</a>
        </div>
        <div className="admin-duty-edit__pharmacy-identity">
          <span
            aria-hidden="true"
            className="admin-duty-edit__pharmacy-placeholder"
          >
            <FirstAidKitIcon weight="fill" />
          </span>
          <div>
            <strong>{pharmacy.name}</strong>
            <span>{pharmacy.address.district}</span>
            {pharmacy.phone ? (
              <a href={`tel:${pharmacy.phone}`}>{pharmacy.phone}</a>
            ) : null}
          </div>
        </div>
        {Number.isFinite(pharmacy.coordinates.latitude) &&
        Number.isFinite(pharmacy.coordinates.longitude) ? (
          <DutyLocationMap pharmacy={pharmacy} />
        ) : null}
        <p className="admin-duty-edit__address">
          <MapPinIcon aria-hidden="true" weight="fill" />
          {address(pharmacy)}
        </p>
      </section>

      {revisions ? (
        <section
          aria-label="Historique des modifications"
          className="admin-duty-edit__side-card admin-duty-edit__history"
        >
          <div className="admin-duty-edit__side-heading">
            <h2 id="duty-edit-history-heading" tabIndex={-1}>
              Historique des modifications
            </h2>
          </div>
          {revisions.data.length ? (
            <ol>
              {revisions.data.map((revision) => (
                <HistoryEntry
                  key={revision.id}
                  onReview={onReview}
                  revision={revision}
                  sources={sources}
                />
              ))}
            </ol>
          ) : (
            <p className="admin-duty-edit__legacy">
              Historique antérieur indisponible
            </p>
          )}
          {revisions.pagination.totalPages > 1 ? (
            <nav
              aria-label="Pagination de l’historique"
              className="admin-duty-edit__pagination"
            >
              <Button
                disabled={historyBusy || revisions.pagination.page <= 1}
                onClick={() => onHistoryPage(revisions.pagination.page - 1)}
                type="button"
                variant="outline"
              >
                Page précédente
              </Button>
              <span>
                Page {revisions.pagination.page} sur{" "}
                {revisions.pagination.totalPages}
              </span>
              <Button
                disabled={
                  historyBusy ||
                  revisions.pagination.page >= revisions.pagination.totalPages
                }
                onClick={() => onHistoryPage(revisions.pagination.page + 1)}
                type="button"
                variant="outline"
              >
                Page suivante
              </Button>
            </nav>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="Informations complémentaires"
        className="admin-duty-edit__side-card admin-duty-edit__complementary"
      >
        <div className="admin-duty-edit__side-heading">
          <h2>Informations complémentaires</h2>
        </div>
        <div>
          <ClockIcon aria-hidden="true" weight="fill" />
          <span>
            <strong>Durée proposée</strong>
            {startsAt && endsAt && Date.parse(endsAt) > Date.parse(startsAt)
              ? durationLabel(startsAt, endsAt)
              : "Période à vérifier"}
          </span>
        </div>
        <div>
          <FileTextIcon aria-hidden="true" weight="fill" />
          <span>
            <strong>
              {duty.status === "PENDING"
                ? "Garde en attente"
                : "Version publiée"}
            </strong>
            Du {dateLabel(duty.startsAt)} au {dateLabel(duty.endsAt)}
          </span>
        </div>
      </section>
    </aside>
  );
}
