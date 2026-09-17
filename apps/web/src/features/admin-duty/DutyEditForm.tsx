import type { AdminPharmacy, AdminScheduleSource } from "@wanzila/contracts";
import { CalendarIcon } from "@phosphor-icons/react/Calendar";
import { FirstAidKitIcon } from "@phosphor-icons/react/FirstAidKit";
import { Save, Search } from "lucide-react";
import type { FormEvent } from "react";
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
import type { LocalFields } from "./admin-duty-edit-format";

type Props = {
  mode: "pending" | "approved";
  pharmacy: AdminPharmacy;
  pharmacies: AdminPharmacy[];
  pharmacyId: string;
  pharmacySearch: string;
  pharmacySearchBusy: boolean;
  pharmacySearchError: string;
  sources: AdminScheduleSource[];
  fields: LocalFields;
  sourceId: string;
  note: string;
  pendingRevision: boolean;
  saving: boolean;
  error: string;
  feedback: string;
  onFieldsChange: (update: Partial<LocalFields>) => void;
  onSourceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onPharmacyChange: (value: string) => void;
  onPharmacySearchChange: (value: string) => void;
  onSearchPharmacies: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
};

export function DutyEditForm({
  mode,
  pharmacy,
  pharmacies,
  pharmacyId,
  pharmacySearch,
  pharmacySearchBusy,
  pharmacySearchError,
  sources,
  fields,
  sourceId,
  note,
  pendingRevision,
  saving,
  error,
  feedback,
  onFieldsChange,
  onSourceChange,
  onNoteChange,
  onPharmacyChange,
  onPharmacySearchChange,
  onSearchPharmacies,
  onSubmit,
  onRefresh,
}: Props) {
  return (
    <section
      aria-label="Informations de la garde"
      className="admin-duty__form-panel admin-duty-edit__form-panel"
    >
      <div className="admin-duty__panel-heading">
        <span aria-hidden="true" className="admin-duty__panel-icon">
          <CalendarIcon weight="fill" />
        </span>
        <div>
          <h2>Informations de la garde</h2>
          <p>
            {mode === "pending"
              ? "Corrigez cette garde en attente. Elle ne sera visible publiquement qu’après approbation."
              : "Préparez une révision ; la version publiée ne change pas avant approbation."}
          </p>
        </div>
      </div>
      <form className="admin-duty-edit__form" noValidate onSubmit={onSubmit}>
        <div className="admin-duty__field">
          {mode === "pending" ? (
            <>
              <Label htmlFor="duty-edit-pharmacy-search">
                Rechercher dans les pharmacies
              </Label>
              <div className="admin-duty-edit__pharmacy-search">
                <Input
                  id="duty-edit-pharmacy-search"
                  onChange={(event) =>
                    onPharmacySearchChange(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSearchPharmacies();
                    }
                  }}
                  placeholder="Nom de la pharmacie"
                  type="search"
                  value={pharmacySearch}
                />
                <Button
                  aria-label="Chercher une pharmacie"
                  disabled={pharmacySearchBusy}
                  onClick={onSearchPharmacies}
                  type="button"
                  variant="outline"
                >
                  <Search aria-hidden="true" />
                </Button>
              </div>
              {pharmacySearchError ? (
                <p role="alert">{pharmacySearchError}</p>
              ) : null}
              <Label htmlFor="duty-edit-pharmacy">Pharmacie</Label>
              <Select onValueChange={onPharmacyChange} value={pharmacyId}>
                <SelectTrigger aria-label="Pharmacie" id="duty-edit-pharmacy">
                  <SelectValue placeholder="Sélectionner une pharmacie" />
                </SelectTrigger>
                <SelectContent>
                  {pharmacies.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pharmacies.length === 0 ? (
                <small>Aucune pharmacie trouvée. Essayez un autre nom.</small>
              ) : null}
            </>
          ) : (
            <>
              <Label>Pharmacie</Label>
              <div className="admin-duty-edit__pharmacy-static">
                <FirstAidKitIcon aria-hidden="true" weight="fill" />
                <span>
                  <strong>{pharmacy.name}</strong>
                  <small>{pharmacy.address.district}</small>
                </span>
                <span className="sr-only">Pharmacie non modifiable</span>
              </div>
              <small>
                La pharmacie ne peut pas être changée sur cette garde.
              </small>
            </>
          )}
        </div>
        <div className="admin-duty-edit__date-grid">
          <fieldset className="admin-duty-edit__date-group">
            <legend>Date et heure de début</legend>
            <div className="admin-duty-edit__date-pair">
              <div className="admin-duty__field">
                <Label className="sr-only" htmlFor="duty-edit-start-date">
                  Date de début
                </Label>
                <Input
                  disabled={pendingRevision}
                  id="duty-edit-start-date"
                  onChange={(event) =>
                    onFieldsChange({ startDate: event.target.value })
                  }
                  type="date"
                  value={fields.startDate}
                />
              </div>
              <div className="admin-duty__field">
                <Label className="sr-only" htmlFor="duty-edit-start-time">
                  Heure de début
                </Label>
                <Input
                  disabled={pendingRevision}
                  id="duty-edit-start-time"
                  onChange={(event) =>
                    onFieldsChange({ startTime: event.target.value })
                  }
                  type="time"
                  value={fields.startTime}
                />
              </div>
            </div>
          </fieldset>
          <fieldset className="admin-duty-edit__date-group">
            <legend>Date et heure de fin</legend>
            <div className="admin-duty-edit__date-pair">
              <div className="admin-duty__field">
                <Label className="sr-only" htmlFor="duty-edit-end-date">
                  Date de fin
                </Label>
                <Input
                  disabled={pendingRevision}
                  id="duty-edit-end-date"
                  onChange={(event) =>
                    onFieldsChange({ endDate: event.target.value })
                  }
                  type="date"
                  value={fields.endDate}
                />
              </div>
              <div className="admin-duty__field">
                <Label className="sr-only" htmlFor="duty-edit-end-time">
                  Heure de fin
                </Label>
                <Input
                  disabled={pendingRevision}
                  id="duty-edit-end-time"
                  onChange={(event) =>
                    onFieldsChange({ endTime: event.target.value })
                  }
                  type="time"
                  value={fields.endTime}
                />
              </div>
            </div>
          </fieldset>
        </div>
        <div className="admin-duty-edit__two-fields">
          <div className="admin-duty__field">
            <Label htmlFor="duty-edit-source">Source du planning</Label>
            <Select
              disabled={pendingRevision}
              onValueChange={(value) =>
                onSourceChange(value === "none" ? "" : value)
              }
              value={sourceId || "none"}
            >
              <SelectTrigger id="duty-edit-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans source</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-duty__field">
            <Label>Statut</Label>
            <div
              className={`admin-duty-edit__status-static${mode === "pending" ? " admin-duty-edit__status-static--pending" : ""}`}
            >
              {mode === "pending" ? "En attente" : "Publiée"}
              <small>
                {mode === "pending"
                  ? "Approbation séparée avant publication"
                  : "Révision soumise séparément"}
              </small>
            </div>
          </div>
        </div>
        {mode === "approved" ? (
          <div className="admin-duty__field">
            <Label htmlFor="duty-edit-note">Motif de la révision</Label>
            <Textarea
              disabled={pendingRevision}
              id="duty-edit-note"
              maxLength={500}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Expliquez la correction du planning"
              value={note}
            />
            <small className="admin-duty-edit__counter">
              {note.length} / 500
            </small>
          </div>
        ) : null}
        {pendingRevision ? (
          <p className="admin-duty-edit__pending" role="note">
            Une révision en attente existe déjà. Elle est immuable jusqu’à sa
            revue.
          </p>
        ) : null}
        {error ? (
          <div className="admin-duty__alert" role="alert">
            <p>{error}</p>
            <Button onClick={onRefresh} type="button" variant="outline">
              Actualiser
            </Button>
          </div>
        ) : null}
        {feedback ? (
          <p className="admin-duty__success" role="status">
            {feedback}
          </p>
        ) : null}
        <div className="admin-duty__form-actions">
          <Button asChild variant="outline">
            <a href="/admin/gardes">Annuler</a>
          </Button>
          <Button
            className="admin-duty__primary-action"
            disabled={saving || pendingRevision}
            type="submit"
          >
            <Save aria-hidden="true" />
            {saving
              ? "Enregistrement…"
              : mode === "pending"
                ? "Enregistrer les modifications"
                : "Soumettre la révision"}
          </Button>
        </div>
      </form>
    </section>
  );
}
