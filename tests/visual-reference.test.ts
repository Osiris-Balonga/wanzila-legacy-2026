import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../docs/design/reference-manifest.json";

const referenceDirectory = resolve(process.cwd(), "docs/design/mockups");
const pngSize = (file: string) => {
  const header = readFileSync(resolve(referenceDirectory, file)).subarray(
    0,
    24,
  );
  expect(header.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

function missingRegions(required: string[], present: string[]): string[] {
  const actual = new Set(present);
  return required.filter((region) => !actual.has(region));
}

describe("supplied visual references", () => {
  it("accounts for every screen and the separate brand asset", () => {
    const actualFiles = readdirSync(referenceDirectory)
      .filter((file) => file.endsWith(".png"))
      .sort();
    const declaredFiles = [
      ...manifest.screens.map((screen) => screen.file),
      ...manifest.assets.map((asset) => asset.file),
    ].sort();
    expect(manifest.screens).toHaveLength(18);
    expect(declaredFiles).toEqual(actualFiles);
    expect(new Set(declaredFiles).size).toBe(declaredFiles.length);
  });

  it("records a valid source crop, route, owner, fixture and regions for each screen", () => {
    for (const screen of manifest.screens) {
      const actual = pngSize(screen.file);
      const source = screen.file.startsWith("mobile-")
        ? manifest.mobileSource
        : manifest.adminSource;
      const expectedSize = "sourceSize" in screen ? screen.sourceSize : source;
      expect(actual).toEqual({
        width: expectedSize.width,
        height: expectedSize.height,
      });
      const crop =
        "webComparisonCrop" in screen
          ? screen.webComparisonCrop
          : source.webComparisonCrop;
      expect(crop.x + crop.width).toBeLessThanOrEqual(actual.width);
      expect(crop.y + crop.height).toBeLessThanOrEqual(actual.height);
      expect(screen.route).toMatch(/^\//);
      expect(screen.ownerIssue).toBeGreaterThan(0);
      expect(screen.fixture).not.toBe("");
      expect(screen.requiredRegions.length).toBeGreaterThan(1);
      expect(screen.states.length).toBeGreaterThan(0);
      expect(screen.approvedDeviations).toEqual([]);
    }
  });

  it("rejects a missing major region independently of screenshot comparison", () => {
    const map = manifest.screens.find(
      (screen) => screen.file === "mobile-map.png",
    );
    expect(map).toBeDefined();
    const visible = map!.requiredRegions.filter(
      (region) => region !== "interactive map",
    );
    expect(missingRegions(map!.requiredRegions, visible)).toEqual([
      "interactive map",
    ]);
    expect(missingRegions(map!.requiredRegions, map!.requiredRegions)).toEqual(
      [],
    );
  });
});
