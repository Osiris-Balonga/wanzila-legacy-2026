import {
  adminContributionListResponseSchema,
  adminContributionResponseSchema,
  adminContributionCorrectionSchema,
  adminContributionDecisionSchema,
  type AdminContribution,
} from "@wanzila/contracts";

export class ContributionHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(`/api/v1/admin/contributions${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ContributionHttpError(
      response.status,
      error?.error?.code ?? "UNKNOWN",
      error?.error?.message ?? "Réponse indisponible",
    );
  }
  return body;
}

export async function listContributions(status: string, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (status) query.set("status", status);
  return adminContributionListResponseSchema.parse(await request(`?${query}`));
}

export async function getContribution(id: string): Promise<AdminContribution> {
  return adminContributionResponseSchema.parse(await request(`/${id}`)).data;
}

export async function correctContribution(
  id: string,
  input: unknown,
): Promise<AdminContribution> {
  const body = adminContributionCorrectionSchema.parse(input);
  return adminContributionResponseSchema.parse(
    await request(`/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  ).data;
}

export async function decideContribution(
  id: string,
  action: "approve" | "reject",
  input: unknown,
): Promise<AdminContribution> {
  const body = adminContributionDecisionSchema.parse(input);
  return adminContributionResponseSchema.parse(
    await request(`/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  ).data;
}

export function contributionError(error: unknown): string {
  if (error instanceof ContributionHttpError) {
    if (error.status === 403)
      return "Cette action est interdite depuis cette origine. Rechargez l’application.";
    if (error.status === 404)
      return "Cette contribution n’est plus disponible.";
    if (error.status === 409) {
      if (error.message.includes("Coordinates required"))
        return "Ajoutez une position vérifiée avant d’approuver.";
      if (error.message.includes("Matching pharmacy"))
        return "Une pharmacie identique existe déjà. Corrigez la proposition ou rejetez-la.";
      if (error.message.includes("duplicate indicators"))
        return "Examinez les rapprochements et confirmez-les explicitement avant d’approuver.";
      return "Cette contribution a changé depuis son chargement. Rechargez-la avant de décider.";
    }
    if (error.status === 400)
      return "Corrigez les champs indiqués et réessayez.";
  }
  return "Impossible de terminer l’action. Vérifiez la connexion et réessayez.";
}

export function redirectIfUnauthenticated(error: unknown): boolean {
  if (error instanceof ContributionHttpError && error.status === 401) {
    window.location.assign("/admin/connexion");
    return true;
  }
  return false;
}
