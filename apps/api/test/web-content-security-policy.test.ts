import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";

const stylePath = fileURLToPath(
  new URL("../../web/public/maps/wanzila-style.json", import.meta.url),
);

function cspDirective(policy: string, name: string): string[] {
  const directive = policy
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([candidate]) => candidate === name);
  return directive?.slice(1) ?? [];
}

describe("served web content security policy", () => {
  const applications: Awaited<ReturnType<typeof createApp>>[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("allows the actual MapLibre style tile and glyph origins without weakening other directives", async () => {
    const webRoot = await mkdtemp(path.join(tmpdir(), "wanzila-csp-"));
    directories.push(webRoot);
    await mkdir(path.join(webRoot, "maps"));
    await writeFile(
      path.join(webRoot, "index.html"),
      "<!doctype html><title>Wanzila</title>",
    );
    const style = await readFile(stylePath, "utf8");
    await writeFile(path.join(webRoot, "maps", "wanzila-style.json"), style);

    const app = await createApp({
      webOrigin: "http://localhost:5173",
      webRoot,
    });
    applications.push(app);

    const page = await app.inject({ method: "GET", url: "/" });
    const mapStyle = await app.inject({
      method: "GET",
      url: "/maps/wanzila-style.json",
    });
    expect(page.statusCode).toBe(200);
    expect(mapStyle.statusCode).toBe(200);

    const policy = page.headers["content-security-policy"];
    expect(typeof policy).toBe("string");
    const connectSources = cspDirective(String(policy), "connect-src");
    const servedStyle = mapStyle.json<{
      glyphs: string;
      sources: Record<string, { url: string }>;
    }>();
    const resourceUrls = [
      servedStyle.glyphs,
      ...Object.values(servedStyle.sources).map((source) => source.url),
    ];
    for (const resourceUrl of resourceUrls) {
      expect(connectSources).toContain(new URL(resourceUrl).origin);
    }
    expect(connectSources).toEqual(["'self'", "https://tiles.openfreemap.org"]);
    expect(cspDirective(String(policy), "script-src")).toContain("'self'");
    expect(cspDirective(String(policy), "object-src")).toEqual(["'none'"]);
    expect(mapStyle.headers["content-security-policy"]).toBe(policy);
  });
});
