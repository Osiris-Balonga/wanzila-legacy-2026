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
type DiscoveryTransport = { track: (event: DiscoveryEvent) => void };

function normalizedText(value: string): string {
  return value.trim();
}

export function createDiscoveryAnalytics(transport: DiscoveryTransport) {
  return {
    viewed: () => {
      transport.track({
        name: "discovery_viewed",
        properties: {},
      });
    },
    submittedSearch: (query: string) => {
      transport.track({
        name: "search_submitted",
        properties: { queryLength: normalizedText(query).length },
      });
    },
    appliedFilters: (filters: {
      district?: string;
      arrondissement?: string;
    }) => {
      const district = filters.district && normalizedText(filters.district);
      const arrondissement =
        filters.arrondissement && normalizedText(filters.arrondissement);
      if (!district && !arrondissement) {
        return;
      }
      transport.track({
        name: "filters_applied",
        properties: {
          ...(district ? { district } : {}),
          ...(arrondissement ? { arrondissement } : {}),
        },
      });
    },
    showedEmptyResults: (query: string) => {
      transport.track({
        name: "empty_results_shown",
        properties: {
          queryLength: normalizedText(query).length,
          resultCount: 0,
        },
      });
    },
    failed: (
      code: "NETWORK_ERROR" | "REQUEST_TIMEOUT" | "SERVICE_UNAVAILABLE",
    ) => {
      transport.track({
        name: "discovery_failed",
        properties: { code },
      });
    },
  };
}
