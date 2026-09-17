import { routeResponseSchema, type RouteRequest } from "@wanzila/contracts";
import type { CalculatedRoute } from "./route-preview";

export type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; route: CalculatedRoute }
  | { status: "no-route" | "rate-limited" | "unavailable" };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createRouteClient({ fetch }: { fetch: FetchLike }) {
  let controller: AbortController | undefined;
  let version = 0;
  return {
    async load(request: RouteRequest): Promise<RouteState> {
      controller?.abort();
      const requestVersion = ++version;
      controller = new AbortController();
      try {
        const response = await fetch("/api/v1/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (version !== requestVersion) return { status: "idle" };
        if (response.status === 422) return { status: "no-route" };
        if (response.status === 429) return { status: "rate-limited" };
        if (!response.ok) return { status: "unavailable" };
        const parsed = routeResponseSchema.safeParse(await response.json());
        if (version !== requestVersion) return { status: "idle" };
        if (
          !parsed.success ||
          parsed.data.data.pharmacyId !== request.pharmacyId ||
          parsed.data.data.mode !== request.mode
        )
          return { status: "unavailable" };
        return { status: "success", route: parsed.data.data };
      } catch {
        return version === requestVersion
          ? { status: "unavailable" }
          : { status: "idle" };
      }
    },
    cancel() {
      controller?.abort();
      version += 1;
    },
  };
}
