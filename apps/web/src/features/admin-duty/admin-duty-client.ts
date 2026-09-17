import {
  adminDutyListResponseSchema,
  adminDutyRevisionListResponseSchema,
  adminDutyRevisionResponseSchema,
  adminDutyResponseSchema,
  adminDutySummaryResponseSchema,
  adminPharmacyListResponseSchema,
  adminPharmacyResponseSchema,
  adminScheduleSourceListResponseSchema,
  createAdminDutyRequestSchema,
  createAdminDutyRevisionRequestSchema,
  type AdminDuty,
  type AdminDutyRevision,
  type AdminPharmacy,
  type AdminScheduleSource,
} from "@wanzila/contracts";
type DutyList = ReturnType<typeof adminDutyListResponseSchema.parse>;
export type DutySummary = ReturnType<
  typeof adminDutySummaryResponseSchema.parse
>["data"];
type Pagination = DutyList["pagination"];
type RevisionList = ReturnType<
  typeof adminDutyRevisionListResponseSchema.parse
>;

export type DutyDirectory = {
  duties: AdminDuty[];
  pagination: Pagination;
  pharmacies: Map<string, AdminPharmacy>;
  sources: AdminScheduleSource[];
};

export type DutyFilters = {
  q: string;
  status: string;
  sourceId: string;
  from: string;
  to: string;
  page: number;
};

export class DutyHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isDutyAuthError(error: unknown): boolean {
  return (
    error instanceof DutyHttpError &&
    (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")
  );
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as {
      error?: { code?: string; message?: string };
    } | null;
    throw new DutyHttpError(
      response.status,
      error?.error?.code ?? "UNKNOWN",
      error?.error?.message ?? "Réponse indisponible",
    );
  }
  return body;
}

function listQuery(filters: DutyFilters): string {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "10",
  });
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.sourceId) query.set("sourceId", filters.sourceId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  return query.toString();
}

export async function listSources(): Promise<AdminScheduleSource[]> {
  const sources: AdminScheduleSource[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = adminScheduleSourceListResponseSchema.parse(
      await request(`/admin/sources?page=${page}&pageSize=50`),
    );
    sources.push(...result.data);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return sources;
}

export async function listPharmacies(name = ""): Promise<AdminPharmacy[]> {
  const query = new URLSearchParams({ page: "1", pageSize: "50" });
  if (name.trim()) query.set("name", name.trim());
  const result = adminPharmacyListResponseSchema.parse(
    await request(`/admin/pharmacies?${query}`),
  );
  return result.data;
}

export async function loadDirectory(
  filters: DutyFilters,
): Promise<DutyDirectory> {
  const result = adminDutyListResponseSchema.parse(
    await request(`/admin/duties?${listQuery(filters)}`),
  );
  const pharmacyIds = [...new Set(result.data.map((duty) => duty.pharmacyId))];
  const [sources, ...pharmacyResults] = await Promise.all([
    listSources(),
    ...pharmacyIds.map(async (id) => {
      try {
        return adminPharmacyResponseSchema.parse(
          await request(`/admin/pharmacies/${id}`),
        ).data;
      } catch {
        return null;
      }
    }),
  ]);
  return {
    duties: result.data,
    pagination: result.pagination,
    pharmacies: new Map(
      pharmacyResults
        .filter((pharmacy): pharmacy is AdminPharmacy => pharmacy !== null)
        .map((pharmacy) => [pharmacy.id, pharmacy]),
    ),
    sources,
  };
}

export async function loadSummary(): Promise<DutySummary> {
  return adminDutySummaryResponseSchema.parse(
    await request("/admin/duties/summary"),
  ).data;
}

export async function createDuty(input: {
  pharmacyId: string;
  sourceId: string | null;
  startsAt: string;
  endsAt: string;
}): Promise<AdminDuty> {
  return adminDutyResponseSchema.parse(
    await request("/admin/duties", {
      method: "POST",
      body: JSON.stringify(createAdminDutyRequestSchema.parse(input)),
    }),
  ).data;
}

export async function loadDuty(id: string): Promise<AdminDuty> {
  return adminDutyResponseSchema.parse(await request(`/admin/duties/${id}`))
    .data;
}

export async function loadDutyPharmacy(id: string): Promise<AdminPharmacy> {
  return adminPharmacyResponseSchema.parse(
    await request(`/admin/pharmacies/${id}`),
  ).data;
}

export async function loadDutyRevisions(
  id: string,
  page: number,
): Promise<RevisionList> {
  return adminDutyRevisionListResponseSchema.parse(
    await request(`/admin/duties/${id}/revisions?page=${page}&pageSize=10`),
  );
}

export async function submitDutyRevision(
  id: string,
  input: {
    sourceId: string | null;
    startsAt: string;
    endsAt: string;
    note: string;
  },
): Promise<AdminDutyRevision> {
  return adminDutyRevisionResponseSchema.parse(
    await request(`/admin/duties/${id}/revisions`, {
      method: "POST",
      body: JSON.stringify(createAdminDutyRevisionRequestSchema.parse(input)),
    }),
  ).data;
}

export async function reviewDutyRevision(
  id: string,
  revisionId: string,
  action: "approve" | "reject",
): Promise<AdminDutyRevision> {
  return adminDutyRevisionResponseSchema.parse(
    await request(`/admin/duties/${id}/revisions/${revisionId}/${action}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  ).data;
}

export async function reviewDuty(
  id: string,
  action: "approve" | "reject",
): Promise<AdminDuty> {
  return adminDutyResponseSchema.parse(
    await request(`/admin/duties/${id}/${action}`, { method: "POST" }),
  ).data;
}
