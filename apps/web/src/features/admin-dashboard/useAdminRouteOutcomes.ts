import {
  adminRouteOutcomesResponseSchema,
  type AdminRouteOutcomesResponse,
} from "@wanzila/contracts";
import { useEffect, useRef, useState } from "react";

type RouteOutcomeData = AdminRouteOutcomesResponse["data"];
type RouteOutcomeState =
  | { status: "loading" }
  | { status: "success"; data: RouteOutcomeData }
  | { status: "error" };

export function useAdminRouteOutcomes(window: "7d" | "30d", enabled: boolean) {
  const [result, setResult] = useState<{
    window: "7d" | "30d";
    state: RouteOutcomeState;
  }>({ window, state: { status: "loading" } });
  const [retryKey, setRetryKey] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const requestVersion = ++version.current;
    setResult({ window, state: { status: "loading" } });
    void (async () => {
      let state: RouteOutcomeState = { status: "error" };
      try {
        const response = await fetch(
          `/api/v1/admin/analytics/route-outcomes?window=${window}`,
          { credentials: "include" },
        );
        if (response.ok) {
          const parsed = adminRouteOutcomesResponseSchema.safeParse(
            await response.json(),
          );
          if (parsed.success && parsed.data.data.window === window) {
            state = { status: "success", data: parsed.data.data };
          }
        }
      } catch {
        // A failed secondary panel must not hide the main dashboard.
      }
      if (version.current === requestVersion) setResult({ window, state });
    })();
    return () => {
      version.current += 1;
    };
  }, [enabled, retryKey, window]);

  return {
    state:
      result.window === window ? result.state : { status: "loading" as const },
    retry: () => setRetryKey((key) => key + 1),
  };
}
