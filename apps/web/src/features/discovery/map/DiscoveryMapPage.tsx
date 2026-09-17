import type { ActivePublicPharmacy } from "@wanzila/contracts";
import { BuildingsIcon } from "@phosphor-icons/react/Buildings";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import { StackIcon } from "@phosphor-icons/react/Stack";
import {
  List,
  LocateFixed,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { SavedPharmacyButton } from "@/features/saved-pharmacies/SavedPharmacyButton";
import type { DiscoveryLoadState, DiscoveryUrlState } from "../types";
import { PharmacyMap } from "./PharmacyMap";
import "./discovery-map.css";

const districts = ["Plateau", "Poto-Poto", "Bacongo", "Moungali"];
const arrondissements = ["Poto-Poto", "Moungali", "Bacongo"];

type LoadedState = Exclude<DiscoveryLoadState, { status: "idle" }>;

function currentPharmacies(state: LoadedState): ActivePublicPharmacy[] {
  return "response" in state ? state.response.data : [];
}

function dutyEnd(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-CG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(isoDate));
}

export function DiscoveryMapPage({
  state,
  filters,
  selectedId,
  onSelect,
  onClearSelection,
  onSearchSubmit,
  onFilterChange,
  onRetry,
  onList,
}: {
  state: LoadedState;
  filters: DiscoveryUrlState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  onSearchSubmit: (query: string) => void;
  onFilterChange: (field: "district" | "arrondissement", value: string) => void;
  onRetry: () => void;
  onList: () => void;
}) {
  const [query, setQuery] = useState(filters.q ?? "");
  const pharmacies = currentPharmacies(state);
  const selected = pharmacies.find((pharmacy) => pharmacy.id === selectedId);

  useEffect(() => setQuery(filters.q ?? ""), [filters.q]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit(query);
  }

  return (
    <main className="discovery-map-page" id="public-content">
      <h1 className="sr-only">Pharmacies de garde</h1>
      <section
        aria-label="Carte des pharmacies"
        className="discovery-map-page__map"
      >
        <PharmacyMap
          onSelect={onSelect}
          pharmacies={pharmacies}
          selectedId={selectedId}
        />
      </section>
      <div className="discovery-map-page__top">
        <form className="discovery-map-search" onSubmit={submit} role="search">
          <Button
            aria-label="Lancer la recherche"
            size="icon"
            type="submit"
            variant="ghost"
          >
            <Search aria-hidden="true" />
          </Button>
          <Input
            aria-label="Rechercher une pharmacie, un quartier"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une pharmacie, un quartier..."
            type="search"
            value={query}
          />
        </form>
        <div className="discovery-map-filters">
          <span className="discovery-map-filters__active">
            <ClockIcon aria-hidden="true" weight="fill" /> Ouvertes maintenant
          </span>
          <label>
            <MapPinIcon aria-hidden="true" weight="fill" />
            <span className="sr-only">Quartier</span>
            <select
              aria-label="Quartier"
              onChange={(event) =>
                onFilterChange("district", event.target.value)
              }
              value={filters.district ?? ""}
            >
              <option value="">Quartier</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>
          <label>
            <BuildingsIcon aria-hidden="true" weight="fill" />
            <span className="sr-only">Arrondissement</span>
            <select
              aria-label="Arrondissement"
              onChange={(event) =>
                onFilterChange("arrondissement", event.target.value)
              }
              value={filters.arrondissement ?? ""}
            >
              <option value="">Arrondissement</option>
              {arrondissements.map((arrondissement) => (
                <option key={arrondissement} value={arrondissement}>
                  {arrondissement}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {state.status === "loading" ? (
        <div className="discovery-map-page__status" role="status">
          Recherche des pharmacies de garde…
        </div>
      ) : null}
      {state.status === "error" ||
      state.status === "empty" ||
      state.status === "invalid-filter" ? (
        <div className="discovery-map-page__status" role="status">
          {state.status === "empty"
            ? "Aucune pharmacie trouvée."
            : state.status === "invalid-filter"
              ? state.message
              : "Les pharmacies ne sont pas disponibles."}
          {state.status === "error" ? (
            <Button onClick={onRetry} size="sm" variant="outline">
              <RefreshCw aria-hidden="true" /> Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
      {state.status === "uncertain-data" ? (
        <p className="discovery-map-page__uncertain" role="status">
          Informations de garde à confirmer auprès de la pharmacie.
        </p>
      ) : null}
      <div className="discovery-map-page__controls">
        <Button
          aria-label="Géolocalisation indisponible"
          disabled
          size="icon"
          title="Géolocalisation indisponible"
          variant="outline"
        >
          <LocateFixed aria-hidden="true" />
        </Button>
        <Button
          aria-label="Couches indisponibles"
          disabled
          size="icon"
          title="Couches indisponibles"
          variant="outline"
        >
          <StackIcon aria-hidden="true" weight="fill" />
        </Button>
        {!selected ? (
          <Button
            className="discovery-map-page__list-button"
            onClick={onList}
            variant="outline"
          >
            <List aria-hidden="true" /> Liste
          </Button>
        ) : null}
      </div>
      {selected ? (
        <section
          aria-label="Pharmacie sélectionnée"
          className="discovery-map-selection"
        >
          <span
            aria-hidden="true"
            className="discovery-map-selection__handle"
          />
          <div className="discovery-map-selection__heading">
            <span
              aria-hidden="true"
              className="discovery-map-selection__identity"
            >
              <Plus />
            </span>
            <div>
              <h2>{selected.name}</h2>
              <span className="discovery-map-selection__duty">
                <ClockIcon aria-hidden="true" weight="fill" /> De garde
                maintenant
              </span>
            </div>
            <Button
              aria-label="Fermer la sélection"
              onClick={onClearSelection}
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <p>
            <MapPinIcon aria-hidden="true" weight="fill" />{" "}
            {selected.address.line}
          </p>
          <p>
            <ClockIcon aria-hidden="true" weight="fill" /> Jusqu’à{" "}
            {dutyEnd(selected.currentDuty.endsAt)}
          </p>
          <div className="discovery-map-selection__actions">
            {selected.phone ? (
              <Button asChild variant="secondary">
                <a href={`tel:${selected.phone}`}>
                  <Phone aria-hidden="true" /> Appeler
                </a>
              </Button>
            ) : (
              <Button disabled variant="secondary">
                <Phone aria-hidden="true" /> Appeler
              </Button>
            )}
            <Button asChild>
              <a href={`/pharmacies/${selected.id}/itineraire`}>
                <Navigation aria-hidden="true" /> Itinéraire
              </a>
            </Button>
            <SavedPharmacyButton id={selected.id} />
          </div>
          <Button
            className="discovery-map-selection__list"
            onClick={onList}
            variant="outline"
          >
            <List aria-hidden="true" /> Liste
          </Button>
        </section>
      ) : null}
      <nav aria-label="Navigation de la carte" className="discovery-map-nav">
        <span aria-current="page">
          <MapPinIcon aria-hidden="true" weight="fill" />
          Carte
        </span>
        <a href="/enregistrees">
          <BookmarkSimpleIcon aria-hidden="true" weight="fill" />
          Enregistrées
        </a>
        <a href="/contribuer">
          <Plus aria-hidden="true" />
          Contribuer
        </a>
      </nav>
    </main>
  );
}
