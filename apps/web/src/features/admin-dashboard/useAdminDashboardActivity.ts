import {
  adminAnalyticsActivityResponseSchema,
  type AdminAnalyticsActivityResponse,
} from "@wanzila/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

type Activity = AdminAnalyticsActivityResponse["data"];
type AnalyticsWindow = "7d" | "30d";
type ActivityState =
  | { status: "loading" }
  | { status: "success"; activity: Activity }
  | { status: "auth-required" | "forbidden" | "error" };

const pageSize = 20;

export function useAdminDashboardActivity(
  window: AnalyticsWindow,
  enabled: boolean,
) {
  const [selection, setSelection] = useState({ window, page: 1 });
  const page = selection.window === window ? selection.page : 1;
  const [retryKey, setRetryKey] = useState(0);
  const queryKey = `${window}:${page}`;
  const [result, setResult] = useState<{
    queryKey: string;
    state: ActivityState;
  }>({ queryKey, state: { status: "loading" } });
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const version = ++requestVersion.current;
    setResult({ queryKey, state: { status: "loading" } });

    void (async () => {
      let next: ActivityState = { status: "error" };
      try {
        const query = new URLSearchParams({
          window,
          page: String(page),
          pageSize: String(pageSize),
        });
        const response = await fetch(
          `/api/v1/admin/analytics/activity?${query}`,
          { credentials: "include" },
        );
        if (response.status === 401) next = { status: "auth-required" };
        else if (response.status === 403) next = { status: "forbidden" };
        else if (response.ok) {
          const payload: unknown = await response.json();
          const parsed =
            adminAnalyticsActivityResponseSchema.safeParse(payload);
          if (
            parsed.success &&
            parsed.data.data.window === window &&
            parsed.data.data.pharmacyActivity.pagination.page === page &&
            parsed.data.data.pharmacyActivity.pagination.pageSize === pageSize
          ) {
            const activity = parsed.data.data;
            const lastPage = Math.max(
              1,
              activity.pharmacyActivity.pagination.totalPages,
            );
            if (page > lastPage) {
              if (requestVersion.current === version) {
                setSelection({ window, page: lastPage });
              }
              return;
            }
            next = { status: "success", activity };
          }
        }
      } catch {
        // Network and malformed JSON failures share the recoverable state.
      }
      if (requestVersion.current === version) {
        setResult({ queryKey, state: next });
      }
    })();

    return () => {
      requestVersion.current += 1;
    };
  }, [enabled, page, queryKey, retryKey, window]);

  const setPage = useCallback(
    (nextPage: number) => setSelection({ window, page: nextPage }),
    [window],
  );
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  return {
    state:
      result.queryKey === queryKey
        ? result.state
        : { status: "loading" as const },
    page,
    setPage,
    retry,
  };
}
