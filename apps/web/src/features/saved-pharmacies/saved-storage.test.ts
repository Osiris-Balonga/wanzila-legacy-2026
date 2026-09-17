import { describe, expect, it } from "vitest";
import {
  SAVED_PHARMACY_IDS_KEY,
  addSavedId,
  readSavedIds,
  removeSavedId,
} from "./saved-storage";

const jagger = "00000000-0000-4000-8000-000000000101";
const mavre = "00000000-0000-4000-8000-000000000102";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("browser-local saved pharmacy IDs", () => {
  it("persists only unique UUIDs and preserves their order across reads", () => {
    const storage = memoryStorage();
    expect(addSavedId(storage, jagger)).toEqual([jagger]);
    expect(addSavedId(storage, jagger)).toEqual([jagger]);
    expect(addSavedId(storage, mavre)).toEqual([jagger, mavre]);
    expect(readSavedIds(storage)).toEqual([jagger, mavre]);
    expect(storage.getItem(SAVED_PHARMACY_IDS_KEY)).toBe(
      JSON.stringify([jagger, mavre]),
    );
  });

  it("removes an ID and permits undo by adding it again", () => {
    const storage = memoryStorage();
    addSavedId(storage, jagger);
    expect(removeSavedId(storage, jagger)).toEqual([]);
    expect(addSavedId(storage, jagger)).toEqual([jagger]);
  });

  it("ignores malformed, duplicate, and non-ID storage entries", () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVED_PHARMACY_IDS_KEY,
      JSON.stringify([jagger, "invalid", jagger, { name: "cached" }, mavre]),
    );
    expect(readSavedIds(storage)).toEqual([jagger, mavre]);
    storage.setItem(SAVED_PHARMACY_IDS_KEY, "not json");
    expect(readSavedIds(storage)).toEqual([]);
  });

  it("does not crash when local storage is unavailable", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("blocked");
    };
    storage.setItem = () => {
      throw new Error("blocked");
    };
    expect(readSavedIds(storage)).toEqual([]);
    expect(addSavedId(storage, jagger)).toEqual([jagger]);
  });

  it("does not change the stored IDs when a remove write is rejected", () => {
    const storage = memoryStorage();
    addSavedId(storage, jagger);
    storage.setItem = () => {
      throw new Error("quota or privacy mode");
    };
    expect(removeSavedId(storage, jagger)).toEqual([]);
    expect(readSavedIds(storage)).toEqual([jagger]);
  });
});
