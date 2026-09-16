import type { ApiError } from "@wanzila/contracts";
import type { FastifyReply } from "fastify";

const errors = {
  badRequest: {
    error: { code: "BAD_REQUEST", message: "Invalid request parameters" },
  },
  notFound: { error: { code: "NOT_FOUND", message: "Resource not found" } },
  rateLimited: {
    error: { code: "RATE_LIMITED", message: "Too many requests" },
  },
  authenticationRequired: {
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication required",
    },
  },
  authenticationFailed: {
    error: {
      code: "AUTHENTICATION_FAILED",
      message: "Invalid email or password",
    },
  },
  originForbidden: {
    error: {
      code: "ORIGIN_FORBIDDEN",
      message: "Request origin is not allowed",
    },
  },
  conflict: {
    error: {
      code: "CONFLICT",
      message: "Request conflicts with the current resource state",
    },
  },
  clientError: { error: { code: "CLIENT_ERROR", message: "Request rejected" } },
} as const satisfies Record<string, ApiError>;

export function sendBadRequest(reply: FastifyReply): void {
  void reply.code(400).send(errors.badRequest);
}

export function sendNotFound(reply: FastifyReply): void {
  void reply.code(404).send(errors.notFound);
}

export function sendAuthenticationRequired(reply: FastifyReply): void {
  void reply.code(401).send(errors.authenticationRequired);
}

export function sendAuthenticationFailed(reply: FastifyReply): void {
  void reply.code(401).send(errors.authenticationFailed);
}

export function sendOriginForbidden(reply: FastifyReply): void {
  void reply.code(403).send(errors.originForbidden);
}

export function sendConflict(reply: FastifyReply, message: string): void {
  void reply.code(409).send({ error: { code: "CONFLICT", message } });
}

export function sendRateLimited(reply: FastifyReply): void {
  void reply.code(429).send(errors.rateLimited);
}

export function sendClientError(reply: FastifyReply, statusCode: number): void {
  const error =
    statusCode === 400
      ? errors.badRequest
      : statusCode === 404
        ? errors.notFound
        : statusCode === 429
          ? errors.rateLimited
          : errors.clientError;
  void reply.code(statusCode).send(error);
}

export function internalError(): ApiError {
  return {
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
}
