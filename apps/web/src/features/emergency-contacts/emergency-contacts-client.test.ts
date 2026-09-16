import type { emergencyContactsResponseSchema } from "@wanzila/contracts";
import { describe, expect, it, vi } from "vitest";

type LoadState =
  | { kind: "loading" }
  | {
      kind: "success";
      data: ReturnType<typeof emergencyContactsResponseSchema.parse>["data"];
    }
  | { kind: "empty" }
  | { kind: "offline" }
  | { kind: "invalid-response" }
  | { kind: "api-error"; status: number };

type EmergencyContactsClient = {
  load: (options: {
    onState: (state: LoadState) => void;
  }) => Promise<LoadState>;
};

type EmergencyContactsClientModule = {
  createEmergencyContactsClient: (options: {
    fetch: typeof fetch;
  }) => EmergencyContactsClient;
};

const responseData = {
  data: [
    {
      id: "00000000-0000-4000-8000-000000001401",
      label: "SAMU",
      phone: "112",
      position: 1,
      updatedAt: "2026-09-15T08:30:45.123Z",
    },
  ],
};

async function loadClientModule(): Promise<EmergencyContactsClientModule> {
  const modulePath = "./emergency-contacts-client.js";
  return (await import(modulePath)) as EmergencyContactsClientModule;
}

describe("issue #12 emergency contacts client boundary", () => {
  it("uses injected fetch and parses the shared response contract before reporting success", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );
    const { createEmergencyContactsClient } = await loadClientModule();
    const observed: LoadState["kind"][] = [];

    const result = await createEmergencyContactsClient({ fetch }).load({
      onState: (state) => observed.push(state.kind),
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/emergency-contacts");
    expect(observed).toEqual(["loading", "success"]);
    expect(result).toEqual({ kind: "success", data: responseData.data });
  });

  it("reports an empty state after a valid empty response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    const { createEmergencyContactsClient } = await loadClientModule();

    await expect(
      createEmergencyContactsClient({ fetch }).load({ onState: vi.fn() }),
    ).resolves.toEqual({ kind: "empty" });
  });

  it("reports an offline state when injected fetch cannot reach the API", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const { createEmergencyContactsClient } = await loadClientModule();

    await expect(
      createEmergencyContactsClient({ fetch }).load({ onState: vi.fn() }),
    ).resolves.toEqual({ kind: "offline" });
  });

  it("reports an API error state for an unsuccessful HTTP response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }), {
        status: 500,
      }),
    );
    const { createEmergencyContactsClient } = await loadClientModule();

    await expect(
      createEmergencyContactsClient({ fetch }).load({ onState: vi.fn() }),
    ).resolves.toEqual({ kind: "api-error", status: 500 });
  });

  it("turns a malformed 200 response into a recoverable invalid-response state", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "00000000-0000-4000-8000-000000001401",
              label: "SAMU",
              phone: "112",
              position: 1,
              unexpected: "browser must not trust this",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const { createEmergencyContactsClient } = await loadClientModule();
    const observed: LoadState["kind"][] = [];

    await expect(
      createEmergencyContactsClient({ fetch }).load({
        onState: (state) => observed.push(state.kind),
      }),
    ).resolves.toEqual({ kind: "invalid-response" });
    expect(observed).toEqual(["loading", "invalid-response"]);
  });
});
