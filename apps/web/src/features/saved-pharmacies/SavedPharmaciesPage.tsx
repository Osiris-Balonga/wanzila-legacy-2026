import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { MapPinIcon } from "@phosphor-icons/react/MapPin";
import { PlusCircleIcon } from "@phosphor-icons/react/PlusCircle";
import type { PublicPharmacy } from "@wanzila/contracts";
import {
  ArrowDownUp,
  Eye,
  LocateFixed,
  Navigation,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PharmacyMap } from "@/features/discovery/map/PharmacyMap";
import {
  fetchSavedPharmacies,
  type SavedPharmaciesResult,
} from "./saved-client";
import { getSavedDutyStatus, nextDutyRefreshDelay } from "./saved-duty";
import {
  SAVED_PHARMACIES_CHANGED_EVENT,
  SAVED_PHARMACY_IDS_KEY,
  addSavedId,
  browserSavedStorage,
  notifySavedPharmaciesChanged,
  readSavedIds,
  removeSavedId,
} from "./saved-storage";
import "./saved-pharmacies.css";

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; result: SavedPharmaciesResult };
type SortMode = "saved" | "name" | "district" | "duty";

function sortedPharmacies(
  pharmacies: PublicPharmacy[],
  sort: SortMode,
  now: number,
) {
  if (sort === "saved") return pharmacies;
  return [...pharmacies].sort((first, second) => {
    if (sort === "duty") {
      const dutyDifference =
        Number(getSavedDutyStatus(second.currentDuty, now).kind === "active") -
        Number(getSavedDutyStatus(first.currentDuty, now).kind === "active");
      if (dutyDifference) return dutyDifference;
    }
    if (sort === "district") {
      const districtDifference = first.address.district.localeCompare(
        second.address.district,
        "fr",
      );
      if (districtDifference) return districtDifference;
    }
    return first.name.localeCompare(second.name, "fr");
  });
}

export function SavedPharmaciesPage() {
  const [ids, setIds] = useState<string[]>(() => {
    const storage = browserSavedStorage();
    return storage ? readSavedIds(storage) : [];
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [removedMissingCount, setRemovedMissingCount] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const undoRef = useRef<HTMLButtonElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const storage = browserSavedStorage();
      setIds(storage ? readSavedIds(storage) : []);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_PHARMACY_IDS_KEY) refresh();
    };
    window.addEventListener(SAVED_PHARMACIES_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SAVED_PHARMACIES_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const load = useCallback(async (savedIds: string[]) => {
    const version = ++requestVersion.current;
    if (savedIds.length === 0) {
      setState({ status: "empty" });
      return;
    }
    setState({ status: "loading" });
    const result = await fetchSavedPharmacies(
      (input, init) => window.fetch(input, init),
      savedIds,
    );
    if (version !== requestVersion.current) return;
    if (result.missingIds.length) {
      const storage = browserSavedStorage();
      if (storage) {
        result.missingIds.forEach((id) => removeSavedId(storage, id));
        const remaining = readSavedIds(storage);
        const cleaned = result.missingIds.filter(
          (id) => !remaining.includes(id),
        );
        if (cleaned.length) {
          setRemovedMissingCount((count) => count + cleaned.length);
          notifySavedPharmaciesChanged();
        }
        if (cleaned.length !== result.missingIds.length) {
          setStorageError(
            "Impossible de modifier les enregistrées sur ce navigateur",
          );
        }
      } else {
        setStorageError(
          "Impossible de modifier les enregistrées sur ce navigateur",
        );
      }
    }
    setState({ status: "ready", result });
  }, []);

  useEffect(() => {
    void load(ids);
    return () => {
      requestVersion.current += 1;
    };
  }, [ids, load]);

  useEffect(() => {
    const duties =
      state.status === "ready"
        ? state.result.pharmacies.flatMap((pharmacy) =>
            pharmacy.currentDuty ? [pharmacy.currentDuty] : [],
          )
        : [];
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      nextDutyRefreshDelay(duties, now),
    );
    const refreshOnReturn = () => setNow(Date.now());
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [now, state]);

  function remove(id: string) {
    const storage = browserSavedStorage();
    if (!storage) {
      setStorageError(
        "Impossible de modifier les enregistrées sur ce navigateur",
      );
      return;
    }
    removeSavedId(storage, id);
    if (readSavedIds(storage).includes(id)) {
      setStorageError(
        "Impossible de modifier les enregistrées sur ce navigateur",
      );
      return;
    }
    setStorageError("");
    setRemovedId(id);
    notifySavedPharmaciesChanged();
    requestAnimationFrame(() => undoRef.current?.focus());
  }

  function undo() {
    if (!removedId) return;
    const storage = browserSavedStorage();
    if (!storage) {
      setStorageError(
        "Impossible de modifier les enregistrées sur ce navigateur",
      );
      return;
    }
    addSavedId(storage, removedId);
    if (!readSavedIds(storage).includes(removedId)) {
      setStorageError(
        "Impossible de modifier les enregistrées sur ce navigateur",
      );
      return;
    }
    setStorageError("");
    setRemovedId(null);
    notifySavedPharmaciesChanged();
  }

  const pharmacies = useMemo(() => {
    if (state.status !== "ready") return [];
    const normalized = query.trim().toLocaleLowerCase("fr");
    return sortedPharmacies(
      state.result.pharmacies.filter(
        (pharmacy) =>
          !normalized ||
          [pharmacy.name, pharmacy.address.district, pharmacy.address.line]
            .join(" ")
            .toLocaleLowerCase("fr")
            .includes(normalized),
      ),
      sort,
      now,
    );
  }, [query, sort, state, now]);
  const failedCount =
    state.status === "ready" ? state.result.failedIds.length : 0;

  return (
    <main className="saved-page" id="public-content">
      <section
        aria-label="Carte des pharmacies enregistrées"
        className="saved-page__map"
      >
        <PharmacyMap
          onSelect={setSelectedId}
          pharmacies={pharmacies}
          selectedId={selectedId}
        />
        <label className="saved-page__search">
          <Search aria-hidden="true" />
          <span className="sr-only">
            Rechercher dans mes pharmacies enregistrées
          </span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une pharmacie, un quartier..."
            type="search"
            value={query}
          />
        </label>
        <Button
          aria-label="Géolocalisation indisponible"
          className="saved-page__location"
          disabled
          size="icon"
          title="Géolocalisation indisponible"
          variant="outline"
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      </section>

      <section aria-labelledby="saved-title" className="saved-page__sheet">
        <span aria-hidden="true" className="saved-page__handle" />
        <div className="saved-page__heading">
          <div>
            <h1 id="saved-title">Mes pharmacies enregistrées</h1>
            <p aria-live="polite">
              {ids.length} pharmacie{ids.length === 1 ? "" : "s"} enregistrée
              {ids.length === 1 ? "" : "s"}
            </p>
          </div>
          <label className="saved-page__sort">
            <ArrowDownUp aria-hidden="true" />
            <span className="sr-only">Trier les pharmacies</span>
            <select
              aria-label="Trier les pharmacies"
              data-default={sort === "saved"}
              onChange={(event) => setSort(event.target.value as SortMode)}
              value={sort}
            >
              <option value="saved">Trier</option>
              <option value="name">Nom</option>
              <option value="district">Quartier</option>
              <option value="duty">Garde</option>
            </select>
          </label>
        </div>
        {storageError ? (
          <p className="saved-page__error" role="alert">
            {storageError}
          </p>
        ) : null}
        {removedMissingCount ? (
          <p className="saved-page__notice" role="status">
            {removedMissingCount} pharmacie
            {removedMissingCount === 1 ? "" : "s"} supprimée
            {removedMissingCount === 1 ? "" : "s"} des enregistrées car
            introuvable{removedMissingCount === 1 ? "" : "s"}.
          </p>
        ) : null}
        {removedId ? (
          <p className="saved-page__notice" role="status">
            Pharmacie retirée.{" "}
            <button onClick={undo} ref={undoRef} type="button">
              Annuler le retrait
            </button>
          </p>
        ) : null}
        {state.status === "loading" ? (
          <p aria-busy="true" role="status">
            Chargement des pharmacies enregistrées…
          </p>
        ) : null}
        {state.status === "empty" ? (
          <div className="saved-page__empty">
            <BookmarkSimpleIcon aria-hidden="true" weight="fill" />
            <h2>Aucune pharmacie enregistrée</h2>
            <p>
              Explorez la carte et enregistrez une pharmacie pour la retrouver
              ici.
            </p>
            <Button asChild>
              <a href="/">Explorer la carte</a>
            </Button>
          </div>
        ) : null}
        {failedCount ? (
          <div className="saved-page__error" role="alert">
            <strong>
              {state.status === "ready" && state.result.pharmacies.length
                ? "Certaines pharmacies enregistrées sont indisponibles"
                : "Impossible de charger vos pharmacies enregistrées"}
            </strong>
            <p>
              Vérifiez votre connexion. Les identifiants restent enregistrés sur
              cet appareil.
            </p>
            <Button
              onClick={() => void load(ids)}
              type="button"
              variant="outline"
            >
              Réessayer
            </Button>
          </div>
        ) : null}
        {state.status === "ready" && pharmacies.length === 0 && !failedCount ? (
          <p className="saved-page__no-match">
            Aucune pharmacie ne correspond à votre recherche.
          </p>
        ) : null}
        {pharmacies.length ? (
          <ul aria-label="Pharmacies enregistrées" className="saved-page__list">
            {pharmacies.map((pharmacy) => {
              const duty = getSavedDutyStatus(pharmacy.currentDuty, now);
              return (
                <li
                  className="saved-card"
                  data-selected={selectedId === pharmacy.id}
                  key={pharmacy.id}
                >
                  <div aria-hidden="true" className="saved-card__photo">
                    <Plus />
                  </div>
                  <div className="saved-card__body">
                    <div className="saved-card__title-row">
                      <div>
                        <h2>{pharmacy.name}</h2>
                        <p>
                          <MapPinIcon aria-hidden="true" weight="fill" />{" "}
                          {pharmacy.address.district ||
                            pharmacy.address.line ||
                            "Adresse non renseignée"}
                        </p>
                      </div>
                      <BookmarkSimpleIcon
                        aria-hidden="true"
                        className="saved-card__bookmark"
                        weight="fill"
                      />
                    </div>
                    <span
                      className={`saved-card__duty saved-card__duty--${duty.kind}`}
                    >
                      <ClockIcon aria-hidden="true" weight="fill" />{" "}
                      {duty.label}
                    </span>
                    <div className="saved-card__actions">
                      <a
                        aria-label={`Voir ${pharmacy.name}`}
                        href={`/pharmacies/${pharmacy.id}`}
                      >
                        <Eye aria-hidden="true" /> Voir
                      </a>
                      <a
                        aria-label={`Itinéraire ${pharmacy.name}`}
                        href={`/pharmacies/${pharmacy.id}/itineraire`}
                      >
                        <Navigation aria-hidden="true" /> Itinéraire
                      </a>
                      <button
                        aria-label={`Retirer ${pharmacy.name}`}
                        onClick={() => remove(pharmacy.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="saved-page__local-note">
          Enregistrées sur cet appareil uniquement. Les gardes sont rechargées
          depuis l’API.
        </p>
      </section>
      <nav
        aria-label="Navigation des pharmacies enregistrées"
        className="saved-page__nav"
      >
        <a href="/">
          <MapPinIcon aria-hidden="true" weight="fill" />
          Carte
        </a>
        <span aria-current="page">
          <BookmarkSimpleIcon aria-hidden="true" weight="fill" />
          Enregistrées
        </span>
        <a href="/contribuer">
          <PlusCircleIcon aria-hidden="true" weight="fill" />
          Contribuer
        </a>
      </nav>
    </main>
  );
}
