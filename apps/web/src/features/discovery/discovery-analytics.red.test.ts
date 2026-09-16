import { describe, expect, it, vi } from "vitest";

const discoveryAnalyticsModule = "./discovery-analytics.js";

type DiscoveryEvent =
  | { name: "discovery_viewed"; properties: Record<string, never> }
  | { name: "search_submitted"; properties: { queryLength: number } }
  | {
      name: "filters_applied";
      properties: { district?: string; arrondissement?: string };
    }
  | {
      name: "empty_results_shown";
      properties: { queryLength: number; resultCount: 0 };
    }
  | {
      name: "discovery_failed";
      properties: {
        code: "NETWORK_ERROR" | "REQUEST_TIMEOUT" | "SERVICE_UNAVAILABLE";
      };
    };

type DiscoveryAnalytics = {
  viewed: () => void;
  submittedSearch: (query: string) => void;
  appliedFilters: (filters: {
    district?: string;
    arrondissement?: string;
  }) => void;
  showedEmptyResults: (query: string) => void;
  failed: (
    code: "NETWORK_ERROR" | "REQUEST_TIMEOUT" | "SERVICE_UNAVAILABLE",
  ) => void;
};

type DiscoveryAnalyticsFactory = (transport: {
  track: (event: DiscoveryEvent) => void;
}) => DiscoveryAnalytics;

function isDiscoveryAnalyticsModule(
  value: unknown,
): value is { createDiscoveryAnalytics: DiscoveryAnalyticsFactory } {
  return (
    typeof value === "object" &&
    value !== null &&
    "createDiscoveryAnalytics" in value &&
    typeof value.createDiscoveryAnalytics === "function"
  );
}

async function loadDiscoveryAnalytics(): Promise<DiscoveryAnalyticsFactory> {
  let candidate: unknown;

  try {
    candidate = await import(/* @vite-ignore */ discoveryAnalyticsModule);
  } catch (error) {
    throw new Error(
      "Issue #6 needs analytics integration through the existing browser transport.",
      { cause: error },
    );
  }

  if (!isDiscoveryAnalyticsModule(candidate)) {
    throw new Error(
      "Issue #6 discovery analytics must export createDiscoveryAnalytics.",
    );
  }

  return candidate.createDiscoveryAnalytics;
}

describe("issue #6 discovery analytics", () => {
  it("emits the public discovery view and controlled failure events", async () => {
    const createDiscoveryAnalytics = await loadDiscoveryAnalytics();
    const track = vi.fn();
    const analytics = createDiscoveryAnalytics({ track });

    analytics.viewed();
    analytics.failed("NETWORK_ERROR");

    expect(track).toHaveBeenNthCalledWith(1, {
      name: "discovery_viewed",
      properties: {},
    });
    expect(track).toHaveBeenNthCalledWith(2, {
      name: "discovery_failed",
      properties: { code: "NETWORK_ERROR" },
    });
  });

  it("tracks search and empty results by length only, never by raw search text", async () => {
    const createDiscoveryAnalytics = await loadDiscoveryAnalytics();
    const track = vi.fn();
    const analytics = createDiscoveryAnalytics({ track });
    const query = "Pharmacie du Marché privé";

    analytics.submittedSearch(query);
    analytics.showedEmptyResults(query);

    expect(track).toHaveBeenNthCalledWith(1, {
      name: "search_submitted",
      properties: { queryLength: query.length },
    });
    expect(track).toHaveBeenNthCalledWith(2, {
      name: "empty_results_shown",
      properties: { queryLength: query.length, resultCount: 0 },
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain(query);
  });

  it("uses the normalized search length and ignores empty administrative filters", async () => {
    const createDiscoveryAnalytics = await loadDiscoveryAnalytics();
    const track = vi.fn();
    const analytics = createDiscoveryAnalytics({ track });

    analytics.submittedSearch("  Paix  ");
    analytics.appliedFilters({ district: " ", arrondissement: "  " });

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith({
      name: "search_submitted",
      properties: { queryLength: 4 },
    });
  });

  it("tracks only meaningful administrative filter applications", async () => {
    const createDiscoveryAnalytics = await loadDiscoveryAnalytics();
    const track = vi.fn();
    const analytics = createDiscoveryAnalytics({ track });

    analytics.appliedFilters({
      district: "Plateau",
      arrondissement: "Poto-Poto",
    });

    expect(track).toHaveBeenCalledWith({
      name: "filters_applied",
      properties: { district: "Plateau", arrondissement: "Poto-Poto" },
    });
  });
});
