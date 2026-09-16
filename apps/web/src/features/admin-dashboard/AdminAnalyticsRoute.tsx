import {
  adminAnalyticsOverviewResponseSchema,
  type AdminAnalyticsOverviewResponse,
} from "@wanzila/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminDashboardPage,
  AdminDataQualityPage,
  type AnalyticsPageState,
} from "./AdminAnalyticsPage";

type AnalyticsWindow = "7d" | "30d";

function isEmpty(overview: AdminAnalyticsOverviewResponse["data"]): boolean {
  const quality = overview.quality;
  return (
    Object.values(overview.events.totals).every((count) => count === 0) &&
    overview.topPharmacies.length === 0 &&
    overview.filterUsage.districts.length === 0 &&
    overview.filterUsage.arrondissements.length === 0 &&
    quality.publishedPharmacies === 0 &&
    quality.pendingContributions === 0 &&
    quality.unresolvedReports === 0 &&
    quality.currentApprovedDutyPeriods === 0 &&
    quality.currentDutyPeriodsExcludedByExceptions === 0 &&
    quality.currentDutyPeriodsAfterExceptions === 0 &&
    Object.values(quality.currentDutySourceFreshness).every(
      (count) => count === 0,
    ) &&
    Object.values(quality.registeredSources).every((count) => count === 0)
  );
}

export function AdminAnalyticsRoute({
  view,
}: {
  view: "dashboard" | "quality";
}) {
  const [window, setWindow] = useState<AnalyticsWindow>("7d");
  const [state, setState] = useState<AnalyticsPageState>({ status: "loading" });
  const [retrying, setRetrying] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(
    (retry = false) => {
      const version = ++requestVersion.current;
      if (retry) setRetrying(true);
      else {
        setRetrying(false);
        setState({ status: "loading" });
      }

      void (async () => {
        let next: AnalyticsPageState = { status: "error" };
        try {
          const response = await fetch(
            `/api/v1/admin/analytics/overview?window=${window}`,
            { credentials: "include" },
          );
          if (response.status === 401) next = { status: "auth-required" };
          else if (response.status === 403) next = { status: "forbidden" };
          else if (response.ok) {
            const payload: unknown = await response.json();
            const parsed =
              adminAnalyticsOverviewResponseSchema.safeParse(payload);
            if (parsed.success && parsed.data.data.window === window) {
              const overview = parsed.data.data;
              next = {
                status: isEmpty(overview) ? "empty" : "success",
                overview,
              };
            }
          }
        } catch {
          // Network and malformed JSON failures share the recoverable error UI.
        }
        if (requestVersion.current !== version) return;
        setState(next);
        setRetrying(false);
      })();
    },
    [window],
  );

  useEffect(() => {
    load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const props = {
    state,
    window,
    onWindowChange: setWindow,
    onRetry: () => load(true),
    retrying,
  };
  return view === "dashboard" ? (
    <AdminDashboardPage {...props} />
  ) : (
    <AdminDataQualityPage {...props} />
  );
}
