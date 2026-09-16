import { useCallback, useEffect, useState } from "react";
import {
  createEmergencyContactsClient,
  type EmergencyContactsLoadState,
} from "./emergency-contacts-client";
import {
  EmergencyContactsPage,
  type EmergencyContactsPageState,
} from "./EmergencyContactsPage";

function toPageState(
  state: EmergencyContactsLoadState,
): EmergencyContactsPageState {
  if (state.kind === "success") {
    return { kind: "success", contacts: state.data };
  }

  if (state.kind === "api-error") {
    return { kind: "api-error" };
  }

  return state;
}

export function EmergencyContactsRoute() {
  const [state, setState] = useState<EmergencyContactsPageState>({
    kind: "loading",
  });

  const load = useCallback(() => {
    const client = createEmergencyContactsClient({
      fetch: (input, init) => window.fetch(input, init),
    });
    return client.load({
      onState: (nextState) => setState(toPageState(nextState)),
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return <EmergencyContactsPage onRetry={() => void load()} state={state} />;
}
