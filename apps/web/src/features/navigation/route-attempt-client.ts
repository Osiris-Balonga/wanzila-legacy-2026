import {
  routeAttemptResponseSchema,
  type RouteAttemptResponse,
  type RouteAttemptStartRequest,
  type RouteAttemptTerminalOutcome,
} from "@wanzila/contracts";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type AttemptRequestResult =
  | { status: "ok"; attempt: RouteAttemptResponse["data"] }
  | { status: "unavailable" | "conflict" };

async function readAttempt(
  response: Response,
  attemptId: string,
): Promise<AttemptRequestResult> {
  if (response.status === 409) return { status: "conflict" };
  if (!response.ok) return { status: "unavailable" };
  try {
    const parsed = routeAttemptResponseSchema.safeParse(await response.json());
    return parsed.success && parsed.data.data.attemptId === attemptId
      ? { status: "ok", attempt: parsed.data.data }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function createRouteAttemptClient({ fetch }: { fetch: FetchLike }) {
  return {
    async start(
      request: RouteAttemptStartRequest,
    ): Promise<AttemptRequestResult> {
      try {
        const response = await fetch("/api/v1/route-attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(request),
        });
        return readAttempt(response, request.attemptId);
      } catch {
        return { status: "unavailable" };
      }
    },
    async finish(
      attemptId: string,
      sessionId: string,
      outcome: RouteAttemptTerminalOutcome,
    ): Promise<AttemptRequestResult> {
      try {
        const response = await fetch(
          `/api/v1/route-attempts/${attemptId}/outcome`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ sessionId, outcome }),
          },
        );
        return readAttempt(response, attemptId);
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}
