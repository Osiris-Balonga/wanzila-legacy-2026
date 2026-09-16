import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";
import {
  sendBadRequest,
  sendConflict,
  sendNotFound,
} from "../shared/http-errors.js";

export interface AdminDutyRouteOptions {
  prisma: ApiPrismaClient;
  now: () => Date;
  webOrigin: string;
  sourceFreshnessMaxAgeMs: number;
}

export type AdminGuard = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

export function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export type MutationFailure = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT";

export function sendMutationFailure(
  reply: FastifyReply,
  failure: MutationFailure,
  message = "Request conflicts with the current resource state",
): void {
  switch (failure) {
    case "BAD_REQUEST":
      sendBadRequest(reply);
      break;
    case "NOT_FOUND":
      sendNotFound(reply);
      break;
    case "CONFLICT":
      sendConflict(reply, message);
      break;
  }
}

/** Convert expected write races into the same envelopes as explicit validation. */
export function handlePrismaMutationError(
  reply: FastifyReply,
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  if (error.code === "P2003" || error.code === "P2025") {
    sendNotFound(reply);
    return true;
  }
  if (error.code === "P2002" || error.code === "P2034") {
    sendConflict(reply, "Concurrent duty administration conflict");
    return true;
  }
  return false;
}
