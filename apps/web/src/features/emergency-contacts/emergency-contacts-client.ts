import {
  emergencyContactsResponseSchema,
  type EmergencyContact,
} from "@wanzila/contracts";

export type EmergencyContactsLoadState =
  | { kind: "loading" }
  | { kind: "success"; data: EmergencyContact[] }
  | { kind: "empty" }
  | { kind: "offline" }
  | { kind: "invalid-response" }
  | { kind: "api-error"; status: number };

type InjectedFetch = typeof fetch;

export type EmergencyContactsClient = {
  load: (options: {
    onState: (state: EmergencyContactsLoadState) => void;
  }) => Promise<EmergencyContactsLoadState>;
};

export function createEmergencyContactsClient({
  fetch,
}: {
  fetch: InjectedFetch;
}): EmergencyContactsClient {
  return {
    async load({ onState }) {
      onState({ kind: "loading" });

      let response: Response;
      try {
        response = await fetch("/api/v1/emergency-contacts");
      } catch {
        const state = { kind: "offline" } as const;
        onState(state);
        return state;
      }

      if (!response.ok) {
        const state = { kind: "api-error", status: response.status } as const;
        onState(state);
        return state;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        const state = { kind: "invalid-response" } as const;
        onState(state);
        return state;
      }

      const parsed = emergencyContactsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        const state = { kind: "invalid-response" } as const;
        onState(state);
        return state;
      }

      if (parsed.data.data.length === 0) {
        const state = { kind: "empty" } as const;
        onState(state);
        return state;
      }

      const state = { kind: "success", data: parsed.data.data } as const;
      onState(state);
      return state;
    },
  };
}
