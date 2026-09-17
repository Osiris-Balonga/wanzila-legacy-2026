import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SAVED_PHARMACIES_CHANGED_EVENT,
  SAVED_PHARMACY_IDS_KEY,
  addSavedId,
  browserSavedStorage,
  notifySavedPharmaciesChanged,
  readSavedIds,
  removeSavedId,
} from "./saved-storage";

export function SavedPharmacyButton({ id }: { id: string }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () =>
      setSaved(
        readSavedIds(browserSavedStorage() ?? emptyStorage).includes(id),
      );
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_PHARMACY_IDS_KEY) refresh();
    };
    refresh();
    window.addEventListener(SAVED_PHARMACIES_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SAVED_PHARMACIES_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [id]);

  function toggle() {
    const storage = browserSavedStorage();
    if (!storage) {
      setError("Enregistrement indisponible sur ce navigateur.");
      return;
    }
    if (saved) removeSavedId(storage, id);
    else addSavedId(storage, id);
    const persisted = readSavedIds(storage).includes(id) !== saved;
    if (!persisted) {
      setError("Enregistrement indisponible sur ce navigateur.");
      return;
    }
    setError("");
    notifySavedPharmaciesChanged();
  }

  return (
    <span className="saved-pharmacy-control">
      <Button
        aria-label={saved ? "Retirer des enregistrées" : "Enregistrer"}
        aria-pressed={saved}
        onClick={toggle}
        type="button"
        variant="secondary"
      >
        <BookmarkSimpleIcon
          aria-hidden="true"
          weight={saved ? "fill" : "regular"}
        />
        <span>{saved ? "Enregistrée" : "Enregistrer"}</span>
      </Button>
      {error ? <span role="status">{error}</span> : null}
    </span>
  );
}

const emptyStorage: Storage = {
  length: 0,
  clear() {},
  getItem: () => null,
  key: () => null,
  removeItem() {},
  setItem() {},
};
