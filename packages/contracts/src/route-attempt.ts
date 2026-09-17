import { z } from "zod";

export const routeAttemptOutcomeSchema = z.enum([
  "UNKNOWN",
  "GPS_CONFIRMED",
  "USER_DECLARED",
  "STOPPED",
  "ALREADY_NEARBY",
]);

export const routeAttemptTerminalOutcomeSchema =
  routeAttemptOutcomeSchema.exclude(["UNKNOWN"]);

export const routeAttemptStartRequestSchema = z
  .object({
    attemptId: z.uuid(),
    pharmacyId: z.uuid(),
    sessionId: z.uuid(),
  })
  .strict();

export const routeAttemptOutcomeRequestSchema = z
  .object({
    sessionId: z.uuid(),
    outcome: routeAttemptTerminalOutcomeSchema,
  })
  .strict();

export const routeAttemptResponseSchema = z.object({
  data: z.object({
    attemptId: z.uuid(),
    pharmacyId: z.uuid(),
    outcome: routeAttemptOutcomeSchema,
    startedAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
});

export type RouteAttemptOutcome = z.infer<typeof routeAttemptOutcomeSchema>;
export type RouteAttemptTerminalOutcome = z.infer<
  typeof routeAttemptTerminalOutcomeSchema
>;
export type RouteAttemptStartRequest = z.infer<
  typeof routeAttemptStartRequestSchema
>;
export type RouteAttemptOutcomeRequest = z.infer<
  typeof routeAttemptOutcomeRequestSchema
>;
export type RouteAttemptResponse = z.infer<typeof routeAttemptResponseSchema>;
